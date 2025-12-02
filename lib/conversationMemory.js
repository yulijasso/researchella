/**
 * Hierarchical Conversation Memory System
 *
 * Manages long conversation histories by:
 * 1. Storing periodic summaries in the database
 * 2. Retrieving relevant context on demand
 * 3. Keeping token usage within limits
 */

import { supabase } from './supabase';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configuration
const CONFIG = {
  SUMMARY_THRESHOLD: 15,        // Summarize when messages exceed this count
  MESSAGES_TO_KEEP: 6,          // Keep last N messages verbatim
  SUMMARY_MAX_TOKENS: 500,      // Max tokens for summary
  MAX_SUMMARIES_TO_RETRIEVE: 3, // Max historical summaries to include
};

/**
 * Estimate token count (rough approximation: 1 token ≈ 4 chars)
 */
function estimateTokens(text) {
  if (!text) return 0;
  if (typeof text === 'string') return Math.ceil(text.length / 4);
  if (Array.isArray(text)) {
    return text.reduce((sum, item) => {
      if (item.type === 'text') return sum + Math.ceil((item.text?.length || 0) / 4);
      if (item.type === 'image_url') return sum + 1000; // Images cost ~1000 tokens minimum
      return sum;
    }, 0);
  }
  return 0;
}

/**
 * Generate a summary of conversation messages using GPT
 */
async function generateSummary(messages) {
  try {
    // Format messages for summarization
    const conversationText = messages.map(m => {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      const content = typeof m.content === 'string'
        ? m.content
        : m.content?.filter(c => c.type === 'text').map(c => c.text).join(' ') || '[media content]';
      return `${role}: ${content.substring(0, 500)}`; // Truncate long messages
    }).join('\n\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Use cheaper model for summarization
      messages: [
        {
          role: 'system',
          content: `You are a conversation summarizer. Create a concise summary of this conversation that captures:
1. Main topics discussed
2. Key questions asked and answers given
3. Important context (mentioned files, documents, topics)
4. Any conclusions or decisions made

Keep the summary under 200 words. Focus on information that would be useful for continuing the conversation later.`
        },
        {
          role: 'user',
          content: `Summarize this conversation:\n\n${conversationText}`
        }
      ],
      max_tokens: CONFIG.SUMMARY_MAX_TOKENS,
      temperature: 0.3,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error generating summary:', error);
    // Fallback: create a simple summary
    const topics = messages
      .filter(m => m.role === 'user')
      .map(m => {
        const content = typeof m.content === 'string' ? m.content : '';
        return content.substring(0, 100);
      })
      .slice(0, 3)
      .join('; ');
    return `Previous discussion covered: ${topics}`;
  }
}

/**
 * Store a conversation summary in the database
 */
async function storeSummary(sessionId, userId, summary, messageRange) {
  try {
    const { data, error } = await supabase
      .from('conversation_summaries')
      .insert({
        session_id: sessionId,
        user_id: userId,
        summary_text: summary,
        message_count: messageRange.count,
        first_message_id: messageRange.firstId,
        last_message_id: messageRange.lastId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error storing summary:', error);
      return null;
    }

    console.log(`📝 Stored conversation summary for session ${sessionId}`);
    return data;
  } catch (error) {
    console.error('Error storing summary:', error);
    return null;
  }
}

/**
 * Retrieve stored summaries for a session
 */
async function getSummaries(sessionId, userId, limit = CONFIG.MAX_SUMMARIES_TO_RETRIEVE) {
  try {
    const { data, error } = await supabase
      .from('conversation_summaries')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching summaries:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching summaries:', error);
    return [];
  }
}

/**
 * Check if summarization is needed and perform it
 */
async function checkAndSummarize(sessionId, userId, messages) {
  // Only summarize if we have enough messages
  if (messages.length < CONFIG.SUMMARY_THRESHOLD) {
    return { summarized: false, messages };
  }

  console.log(`🧠 Conversation has ${messages.length} messages, triggering summarization...`);

  // Messages to summarize (all except the last MESSAGES_TO_KEEP)
  const messagesToSummarize = messages.slice(0, -CONFIG.MESSAGES_TO_KEEP);
  const messagesToKeep = messages.slice(-CONFIG.MESSAGES_TO_KEEP);

  if (messagesToSummarize.length < 4) {
    // Not enough to summarize
    return { summarized: false, messages };
  }

  // Generate summary
  const summary = await generateSummary(messagesToSummarize);

  // Store in database
  const messageRange = {
    count: messagesToSummarize.length,
    firstId: messagesToSummarize[0]?.id || null,
    lastId: messagesToSummarize[messagesToSummarize.length - 1]?.id || null,
  };

  await storeSummary(sessionId, userId, summary, messageRange);

  console.log(`✅ Summarized ${messagesToSummarize.length} messages, keeping ${messagesToKeep.length} recent`);

  return {
    summarized: true,
    summary,
    messages: messagesToKeep,
  };
}

/**
 * Build optimized context for the LLM
 * Combines recent messages with historical summaries
 */
async function buildOptimizedContext(sessionId, userId, currentMessages, hasImages = false) {
  // Adjust limits based on whether images are present
  const maxMessages = hasImages ? 4 : CONFIG.MESSAGES_TO_KEEP;
  const maxSummaries = hasImages ? 1 : CONFIG.MAX_SUMMARIES_TO_RETRIEVE;

  // Get historical summaries
  const summaries = await getSummaries(sessionId, userId, maxSummaries);

  // Prepare summary context
  let summaryContext = '';
  if (summaries.length > 0) {
    summaryContext = '\n\n📜 PREVIOUS CONVERSATION CONTEXT:\n';
    summaryContext += summaries
      .reverse() // Oldest first
      .map((s, i) => `[Earlier conversation ${i + 1}]: ${s.summary_text}`)
      .join('\n\n');
    summaryContext += '\n\n---\n';
  }

  // Truncate current messages
  let truncatedMessages = currentMessages;
  if (currentMessages.length > maxMessages) {
    truncatedMessages = currentMessages.slice(-maxMessages);
    console.log(`📋 Truncated messages from ${currentMessages.length} to ${maxMessages}`);
  }

  // Strip images from all but last message (if present)
  if (hasImages && truncatedMessages.length > 1) {
    truncatedMessages = truncatedMessages.map((msg, idx) => {
      if (idx === truncatedMessages.length - 1) return msg;
      if (Array.isArray(msg.content)) {
        const textOnly = msg.content.filter(item => item.type !== 'image_url');
        if (textOnly.length === 0) {
          return { ...msg, content: '[Image was shared]' };
        }
        return { ...msg, content: textOnly };
      }
      return msg;
    });
  }

  // Calculate token estimate
  const messagesTokens = truncatedMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const summaryTokens = estimateTokens(summaryContext);

  console.log(`🔢 Context tokens: ${messagesTokens} (messages) + ${summaryTokens} (summaries) = ${messagesTokens + summaryTokens}`);

  return {
    summaryContext,
    messages: truncatedMessages,
    totalEstimatedTokens: messagesTokens + summaryTokens,
    hasSummaries: summaries.length > 0,
  };
}

/**
 * Main function: Process messages with hierarchical memory
 */
export async function processWithMemory(sessionId, userId, messages, hasImages = false) {
  // Check if we need to summarize
  const summarizeResult = await checkAndSummarize(sessionId, userId, messages);

  // Build optimized context
  const context = await buildOptimizedContext(
    sessionId,
    userId,
    summarizeResult.messages,
    hasImages
  );

  return {
    ...context,
    wasJustSummarized: summarizeResult.summarized,
    newSummary: summarizeResult.summary || null,
  };
}

/**
 * Get token-safe messages for API call
 * This is a simpler version that just truncates without database
 */
export function getTokenSafeMessages(messages, hasImages = false, maxTokens = 20000) {
  const maxMessages = hasImages ? 4 : 20;

  // Start from the end and work backwards
  let selectedMessages = [];
  let totalTokens = 0;

  for (let i = messages.length - 1; i >= 0 && selectedMessages.length < maxMessages; i--) {
    const msg = messages[i];
    const msgTokens = estimateTokens(msg.content);

    // Check if adding this message would exceed limit
    if (totalTokens + msgTokens > maxTokens && selectedMessages.length > 0) {
      break;
    }

    // Strip images from older messages
    if (hasImages && i < messages.length - 1 && Array.isArray(msg.content)) {
      const textOnly = msg.content.filter(item => item.type !== 'image_url');
      if (textOnly.length === 0) {
        selectedMessages.unshift({ ...msg, content: '[Image was shared]' });
        totalTokens += 10; // Placeholder text tokens
      } else {
        selectedMessages.unshift({ ...msg, content: textOnly });
        totalTokens += estimateTokens(textOnly);
      }
    } else {
      selectedMessages.unshift(msg);
      totalTokens += msgTokens;
    }
  }

  console.log(`📊 Token-safe messages: ${selectedMessages.length}/${messages.length}, ~${totalTokens} tokens`);

  return {
    messages: selectedMessages,
    estimatedTokens: totalTokens,
    truncated: selectedMessages.length < messages.length,
  };
}

export default {
  processWithMemory,
  getTokenSafeMessages,
  generateSummary,
  storeSummary,
  getSummaries,
  CONFIG,
};
