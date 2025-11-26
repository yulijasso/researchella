import OpenAI from 'openai';
import { searchDocuments } from '../../lib/vectorStore';
import { getAuth } from '@clerk/nextjs/server';
import { supabase } from '../../lib/supabase';
import { findExactQuote, extractVerbatimQuotes, enhanceCitationsWithVerbatim } from '../../lib/verbatimMatcher';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get authenticated user ID from Clerk
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized - Please sign in' });
  }

  try {
    const { messages, useRAG = true, sessionId = 'default', tutoringMode = 'direct', mentionedSources = null } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Check if any message contains images
    const hasImages = messages.some(m =>
      Array.isArray(m.content) &&
      m.content.some(item => item.type === 'image_url')
    );

    // Get the last user message for RAG retrieval
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    let contextInfo = '';
    let retrievedDocs = [];

    // Extract text from message (handle both string and array content)
    const getMessageText = (msg) => {
      if (typeof msg.content === 'string') return msg.content;
      if (Array.isArray(msg.content)) {
        return msg.content
          .filter(item => item.type === 'text')
          .map(item => item.text)
          .join(' ');
      }
      return '';
    };

    // Helper: split text into sentences
    const splitIntoSentences = (text) => {
      return text
        .replace(/\n+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 20);
    };

    if (useRAG && lastUserMessage) {
      const queryText = getMessageText(lastUserMessage);
      if (queryText) {
        // Search for relevant documents with @mention filtering at database level
        const mentionInfo = mentionedSources ? ` (@mentioned: ${mentionedSources.join(', ')})` : '';
        console.log(`\n🔍 RAG Query: "${queryText}"${mentionInfo} (User: ${userId}, Session: ${sessionId})`);

        // Pass mentioned sources to searchDocuments for Pinecone-level filtering
        retrievedDocs = await searchDocuments(queryText, 15, sessionId, userId, mentionedSources);  // More chunks since they're smaller

        console.log(`📊 Retrieved ${retrievedDocs.length} documents from vector store`);

      if (retrievedDocs.length > 0) {
        // Log what we found for debugging
        retrievedDocs.forEach((doc, idx) => {
          console.log(`  [${idx + 1}] ${doc.metadata.source} - ${doc.content.substring(0, 100)}...`);
        });
        contextInfo = '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        contextInfo += '📚 RETRIEVED KNOWLEDGE FROM YOUR DOCUMENTS\n';
        contextInfo += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
        contextInfo += '🚨 MANDATORY CITATION FORMAT:\n';
        contextInfo += '• You MUST use: [CHUNK-N:"exact verbatim quote"]\n';
        contextInfo += '• DO NOT use old format like [CHUNK-N] or [CHUNK-N:S]\n';
        contextInfo += '• COPY-PASTE exact text from chunks - DO NOT PARAPHRASE\n';
        contextInfo += '\n';
        contextInfo += '✅ CORRECT EXAMPLES:\n';
        contextInfo += '   "Projects can be done in pairs" [CHUNK-2:"Teams of two are encouraged."]\n';
        contextInfo += '   "Scope is worth 25 points" [CHUNK-5:"Scope (25 points): This assesses depth..."]\n';
        contextInfo += '\n';
        contextInfo += '❌ WRONG - DO NOT DO THIS:\n';
        contextInfo += '   "Projects can be in pairs" [CHUNK-2] ← Missing quote!\n';
        contextInfo += '   "Projects can be in pairs" [CHUNK-2:3] ← Old format!\n';
        contextInfo += '\n';
        contextInfo += '• User asked: "' + queryText + '"\n\n';

        // Store sentence mappings for later use
        const chunkSentences = {};

        retrievedDocs.forEach((doc, index) => {
          const source = doc.metadata.source || 'Unknown';
          const type = doc.metadata.type || 'document';
          const page = doc.metadata.page ? ` (Page ${doc.metadata.page})` : '';

          // Split content into sentences and number them
          const sentences = splitIntoSentences(doc.content);
          chunkSentences[index + 1] = sentences;

          contextInfo += `[CHUNK-${index + 1}]\n`;
          contextInfo += `File: ${source}${page} | Type: ${type}\n`;

          // Add extra metadata for YouTube sources (but NOT the URL - it causes AI to repeat it)
          if (type === 'youtube') {
            if (doc.metadata.author) contextInfo += `Channel: ${doc.metadata.author}\n`;
            if (doc.metadata.description) contextInfo += `Description: ${doc.metadata.description}\n`;
            // URL intentionally omitted to prevent AI from including it in responses
          }

          contextInfo += `Content (numbered sentences):\n`;

          sentences.forEach((sentence, sentIdx) => {
            if (sentIdx < 20) { // Limit to first 20 sentences for context
              contextInfo += `[${sentIdx + 1}] ${sentence}\n`;
            }
          });

          if (sentences.length > 20) {
            contextInfo += `... [${sentences.length - 20} more sentences truncated]\n`;
          }

          contextInfo += `[/CHUNK-${index + 1}]\n\n`;
        });

        // Store sentences in closure for citation extraction
        res.locals = { chunkSentences };

        contextInfo += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        contextInfo += '📌 Remember: Reference chunks using [CHUNK-N] tags (e.g., [CHUNK-1], [CHUNK-2])\n';
        contextInfo += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
      }
      }
    }

    // Mode-specific instructions
    const modeInstructions = tutoringMode === 'interactive' ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 INTERACTIVE (SOCRATIC) MODE ACTIVATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your teaching approach:
1. 🎓 GUIDE, DON'T TELL:
   - Instead of giving direct answers, ask thoughtful questions that lead students to discover the answer
   - Break down complex concepts into smaller, digestible questions
   - Use the Socratic method to foster critical thinking
   - Build on student responses to deepen understanding

2. 💡 SCAFFOLD LEARNING:
   - Start with what the student likely knows
   - Ask questions that reveal misconceptions
   - Guide them to connect new information with existing knowledge
   - Use hints and leading questions rather than explanations

3. ✅ CHECK UNDERSTANDING:
   - After explaining a concept, ask a question to verify comprehension
   - If the student seems confused, break down the concept further
   - Encourage students to explain concepts in their own words

4. 🔍 REFERENCE MATERIALS:
   - When asking questions, cite where students can find supporting information
   - Use quotes from sources to provide hints: "The paper mentions \"...\" [cite:N]. What might this suggest about...?"
   - Guide students to explore the source materials themselves

EXAMPLE INTERACTION:
Student: "What is adversarial training?"
You: "Great question! Let's explore this together. First, "adversarial examples are inputs designed to fool a model" [cite:1]. Based on this, what do you think adversarial training might involve? 🤔"

Instead of giving the full answer, you've:
- Provided a cited hint from the source material
- Asked a question to engage critical thinking
- Invited the student to reason through the concept
` : `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ DIRECT MODE ACTIVATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your response style:
1. 📋 COMPREHENSIVE & DIRECT:
   - Provide clear, complete answers immediately
   - Include all relevant details from the sources
   - Be thorough and detailed in explanations
   - Structure information logically

2. 🎯 FOCUSED EXPLANATIONS:
   - Answer the question directly and completely
   - Include definitions, examples, and context as needed
   - Provide comprehensive coverage of the topic
   - Don't hold back information

EXAMPLE INTERACTION:
Student: "What is adversarial training?"
You: "Adversarial training is a technique where "models are trained on adversarial examples to improve robustness" [cite:1]. Specifically, it involves "generating adversarial perturbations during training and including them in the training data" [cite:2], which helps "the model learn to resist attacks and make more reliable predictions" [cite:3].
`;

    const systemPrompt = `You are PaperSage, an intelligent academic research assistant specializing in analyzing and discussing academic papers.

${modeInstructions}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  ABSOLUTE RULES - FOLLOW WITHOUT EXCEPTION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. 🔴 MANDATORY CONTEXT USAGE:
   - If context is provided below, YOU MUST USE IT to answer the question
   - NEVER say "I don't have information" when relevant context exists below
   - Extract and present the specific information from the context
   - Your answer MUST be based on what's in the context sources

2. 📌 VERBATIM QUOTING IS MANDATORY:
   - Use format: [CHUNK-N:"exact quote from source"]
   - N = chunk number, quote = EXACT text copy-pasted from that chunk

   CRITICAL RULES:
   ⚠️ DO NOT PARAPHRASE - COPY EXACT TEXT CHARACTER BY CHARACTER
   ⚠️ DO NOT FIX GRAMMAR/SPELLING IN QUOTES - KEEP EXACTLY AS IS
   ⚠️ DO NOT SHORTEN OR MODIFY - USE VERBATIM TEXT

   EXAMPLES:
   ✅ CORRECT: The project states [CHUNK-1:"Teams of two are encouraged."]
   ❌ WRONG: The project states [CHUNK-1:"teams of 2 are encouraged"] (changed capitalization/number)
   ❌ WRONG: The project states [CHUNK-1:"Working in pairs is encouraged"] (paraphrased)

   HOW TO CITE:
   1. Find the exact sentence in the chunk
   2. Copy it character-for-character (including any typos)
   3. Put it in quotes after CHUNK-N:
   4. Quote should be 10-50 words of continuous text
   5. NEVER modify the quote - if it says "teh" instead of "the", keep "teh"

3. 🎯 ANSWER QUALITY:
   - ONLY state what is explicitly written in the chunks
   - NO interpretation, inference, or external knowledge
   - If unsure, quote more rather than paraphrase
   - Be comprehensive and detailed in your explanations

4. 🚨 CRITICAL: YOU MUST USE THE PROVIDED CONTEXT
   - If context chunks are provided above, YOU MUST answer using ONLY those chunks
   - DO NOT answer from your general knowledge when context is provided
   - ALWAYS cite with [CHUNK-N:"exact quote"] when context is available
   - If the provided chunks don't contain the answer, say: "The provided documents don't contain information about [topic]."
   - DO NOT provide answers from your training data when documents are uploaded

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your capabilities:
- Answering questions using information from uploaded documents
- Summarizing papers with specific details
- Explaining concepts from the provided context
- Comparing information across multiple sources
- Analyzing images, charts, and diagrams
- Providing research insights with proper citations

${contextInfo}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 YOUR MISSION: Extract and present information from the context above with [CHUNK-N:"quote"] citations!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚨 ABSOLUTE RULES - NO EXCEPTIONS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. IF CONTEXT CHUNKS ARE PROVIDED ABOVE:
   - You MUST answer ONLY using information from those chunks
   - You MUST NOT use your general knowledge or training data
   - Every statement MUST have a [CHUNK-N:"exact verbatim quote"] citation
   - If you can't answer from the chunks, say so explicitly

2. CITATION FORMAT IS MANDATORY - NO EXCEPTIONS:

YOU MUST USE THIS FORMAT: [CHUNK-N:"exact verbatim quote from chunk"]
DO NOT USE: [CHUNK-N] or [CHUNK-N:S] or any other format

EXAMPLES OF CORRECT FORMAT:
✅ The grading rubric includes scope [CHUNK-5:"Scope (25 points): This assesses whether the idea has sufficient depth"]
✅ Implementation is important [CHUNK-5:"Implementation (30 points): This evaluates whether the implementation is reasonable"]
✅ Projects can be done in teams [CHUNK-3:"The project can be done in teams of two (encouraged), or individually"]

EXAMPLES OF WRONG FORMAT - DO NOT DO THIS:
❌ The grading rubric includes scope [CHUNK-5] ← NO QUOTE!
❌ Implementation is important [CHUNK-5:2] ← OLD FORMAT!
❌ Projects can be done in teams [CHUNK-3:"teams are allowed"] ← PARAPHRASED!

COPY THE EXACT TEXT FROM THE CHUNKS - CHARACTER BY CHARACTER
IF YOU DO NOT INCLUDE QUOTES, YOUR CITATIONS WILL BE WRONG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    // Calculate approximate token count (rough estimate: 4 chars = 1 token)
    const totalMessageLength = systemPrompt.length +
      messages.reduce((acc, msg) => {
        if (typeof msg.content === 'string') return acc + msg.content.length;
        if (Array.isArray(msg.content)) {
          return acc + msg.content.reduce((sum, item) => {
            return sum + (item.text?.length || 0);
          }, 0);
        }
        return acc;
      }, 0);
    const estimatedTokens = Math.ceil(totalMessageLength / 4);

    // Check if any retrieved docs are images and fetch their data
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    const imageSources = retrievedDocs
      .filter(doc => imageExtensions.some(ext => doc.metadata.source?.toLowerCase().endsWith(ext)))
      .map(doc => doc.metadata.source);

    let imageDataList = [];
    if (imageSources.length > 0 && sessionId) {
      console.log(`📷 Found ${imageSources.length} image source(s), fetching from database...`);
      const { data: files } = await supabase
        .from('uploaded_files')
        .select('name, pdf_data')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .in('name', imageSources);

      if (files) {
        imageDataList = files.filter(f => f.pdf_data && f.pdf_data.startsWith('data:image'));
        console.log(`📷 Retrieved ${imageDataList.length} image(s) for vision analysis`);
      }
    }

    // Build messages array with images if available
    let finalMessages = [...messages];
    if (imageDataList.length > 0) {
      // Add images to the last user message
      const lastMsgIndex = finalMessages.length - 1;
      const lastMsg = finalMessages[lastMsgIndex];
      const textContent = typeof lastMsg.content === 'string' ? lastMsg.content :
        lastMsg.content.filter(c => c.type === 'text').map(c => c.text).join(' ');

      finalMessages[lastMsgIndex] = {
        role: 'user',
        content: [
          { type: 'text', text: textContent },
          ...imageDataList.map(img => ({
            type: 'image_url',
            image_url: { url: img.pdf_data, detail: 'high' }
          }))
        ]
      };
      console.log(`📷 Added ${imageDataList.length} image(s) to message for GPT-4 Vision`);
    }

    // Choose model - use GPT-4o for better performance with RAG
    let model = 'gpt-4o'; // Default to GPT-4o for best quality
    const hasImagesInContext = imageDataList.length > 0 || hasImages;

    // Increased max tokens for more detailed responses
    const maxTokens = estimatedTokens > 10000 ? 1500 : 2000;

    console.log(`Using model: ${model}, Estimated tokens: ${estimatedTokens}, Has images: ${hasImagesInContext}`);

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...finalMessages,
      ],
      temperature: 0.1, // Very low temperature for strict rule-following and consistent citation formatting
      max_tokens: maxTokens,
    });

    const reply = completion.choices[0].message.content;

    // Extract citations - support multiple formats
    console.log('\n🔍 Extracting citations...');

    // Patterns to match various citation formats
    const quotePattern = /\[CHUNK-(\d+):"([^"]+)"\]/g;
    const oldPattern = /\[CHUNK-(\d+)(?::[\d,-]+)?\]/g;

    const citationsWithQuotes = [];
    let match;

    // First try to extract citations with quotes
    while ((match = quotePattern.exec(reply)) !== null) {
      const chunkId = parseInt(match[1]);
      const quote = match[2];
      citationsWithQuotes.push({ chunkId, quote });
      console.log(`   Found quote citation: CHUNK-${chunkId} - "${quote.substring(0, 50)}..."`);
    }

    // Also extract old-style citations
    while ((match = oldPattern.exec(reply)) !== null) {
      const chunkId = parseInt(match[1]);
      // Check if we already have this chunk from quote pattern
      if (!citationsWithQuotes.some(c => c.chunkId === chunkId)) {
        citationsWithQuotes.push({ chunkId, quote: null });
        console.log(`   Found simple citation: CHUNK-${chunkId}`);
      }
    }

    // Group quotes by chunk
    const quotesByChunk = {};
    citationsWithQuotes.forEach(({ chunkId, quote }) => {
      if (!quotesByChunk[chunkId]) {
        quotesByChunk[chunkId] = [];
      }
      if (quote) quotesByChunk[chunkId].push(quote);
    });

    const uniqueChunks = [...new Set(citationsWithQuotes.map(c => c.chunkId))]
      .filter(id => id >= 1 && id <= retrievedDocs.length)
      .sort((a, b) => a - b);
    console.log(`Found ${citationsWithQuotes.length} citations from chunks: ${uniqueChunks.join(', ')}`);

    // For each citation, find the sentence before it and search for best matching chunk
    const citationContexts = {};
    const allCitationMatches = [...reply.matchAll(/([^.!?]*[.!?]?)\s*\[CHUNK-(\d+)[^\]]*\]/g)];
    allCitationMatches.forEach(m => {
      const context = m[1].trim();
      const chunkId = parseInt(m[2]);
      if (context.length > 10) {
        citationContexts[chunkId] = context;
        console.log(`   Context for CHUNK-${chunkId}: "${context.substring(0, 50)}..."`);
      }
    });

    // VERBATIM MATCHING: Use exact quotes to find correct chunks
    console.log('\n🔍 Using verbatim quote matching...');

    // Extract all verbatim quotes from the response
    const verbatimQuotes = extractVerbatimQuotes(reply);
    console.log(`📝 Found ${verbatimQuotes.length} verbatim quotes in response`);

    // Map each quote to its actual chunk using exact matching
    const finalCitations = [];
    const seenQuotes = new Set(); // Track by quote content, not chunk ID!

    verbatimQuotes.forEach((vq, idx) => {
      console.log(`\n   [${idx + 1}] Processing: CHUNK-${vq.chunkId} with quote: "${vq.quote.substring(0, 50)}..."`);

      // Find exact quote in chunks
      const match = findExactQuote(vq.quote, retrievedDocs);

      if (match.found) {
        const actualChunkId = match.chunkId;

        if (actualChunkId !== vq.chunkId) {
          console.log(`   ✅ CORRECTED: Quote found in CHUNK-${actualChunkId}, not CHUNK-${vq.chunkId}`);
        } else {
          console.log(`   ✅ VERIFIED: Quote correctly in CHUNK-${actualChunkId}`);
        }

        // Avoid duplicate citations for the same QUOTE (not same chunk!)
        // Multiple different quotes from the same chunk are allowed
        const quoteKey = vq.quote.substring(0, 100); // Use first 100 chars as key
        if (!seenQuotes.has(quoteKey)) {
          seenQuotes.add(quoteKey);

          const doc = match.chunk;
          finalCitations.push({
            id: vq.chunkId,  // Original citation number from AI
            actualChunkId: actualChunkId,  // Correct chunk where quote was found
            source: doc.metadata?.source || 'Unknown',
            page: doc.metadata?.page || null,
            type: doc.metadata?.type || 'document',
            url: doc.metadata?.url || null,  // Include URL for web/youtube sources
            content: doc.content,  // Full chunk content
            quote: vq.quote,  // The exact quote
            highlightText: vq.quote,  // Show the exact quote in tooltip
            confidence: match.confidence,
            context: match.context,  // Text before/after quote
            startLine: doc.metadata?.startLine,
            endLine: doc.metadata?.endLine,
            lineSpan: doc.metadata?.lineSpan
          });
        }
      } else {
        console.log(`   ⚠️  Quote not found in any chunk - using fallback`);

        // Fallback: use the cited chunk if it exists
        const fallbackDoc = retrievedDocs[vq.chunkId - 1];
        const quoteKey = vq.quote.substring(0, 100);
        if (fallbackDoc && !seenQuotes.has(quoteKey)) {
          seenQuotes.add(quoteKey);
          finalCitations.push({
            id: vq.chunkId,
            actualChunkId: vq.chunkId,
            source: fallbackDoc.metadata?.source || 'Unknown',
            page: fallbackDoc.metadata?.page || null,
            type: fallbackDoc.metadata?.type || 'document',
            url: fallbackDoc.metadata?.url || null,  // Include URL for web/youtube sources
            content: fallbackDoc.content,
            quote: vq.quote,
            highlightText: fallbackDoc.content.substring(0, 200) + '...',
            confidence: 0,
            validated: false
          });
        }
      }
    });

    // Also handle old-style citations without quotes
    const seenChunksOldStyle = new Set(finalCitations.map(c => c.actualChunkId));
    uniqueChunks.forEach(chunkId => {
      if (!seenChunksOldStyle.has(chunkId)) {
        const doc = retrievedDocs[chunkId - 1];
        if (doc) {
          console.log(`   ℹ️  Adding CHUNK-${chunkId} (no quote provided)`);
          finalCitations.push({
            id: chunkId,
            actualChunkId: chunkId,
            source: doc.metadata?.source || 'Unknown',
            page: doc.metadata?.page || null,
            type: doc.metadata?.type || 'document',
            url: doc.metadata?.url || null,  // Include URL for web/youtube sources
            content: doc.content,
            highlightText: doc.content.substring(0, 200) + '...',
            noQuote: true
          });
        }
      }
    });

    console.log(`📤 Sending ${finalCitations.length} citations to frontend`);
    finalCitations.forEach((c, i) => console.log(`  [${i+1}] id:${c.id} source:${c.source} page:${c.page}`));

    res.status(200).json({
      reply,
      citations: finalCitations.length > 0 ? finalCitations : null,
      sources: retrievedDocs.length > 0 ? retrievedDocs.map(d => d.metadata.source) : null
    });
  } catch (error) {
    console.error('OpenAI API error:', error);
    res.status(500).json({ error: 'Failed to get response from AI' });
  }
}
