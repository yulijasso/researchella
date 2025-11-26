import axios from 'axios';
import * as cheerio from 'cheerio';
import { getAuth } from '@clerk/nextjs/server';
import { addDocumentsToStore } from "../../lib/vectorStore";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { url, sessionId = 'default' } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Scraping URL: ${url}`);

    // Determine the type of URL and use appropriate scraper
    let extractedData = null;

    if (url.includes('arxiv.org')) {
      extractedData = await scrapeArxiv(url);
    } else if (url.includes('pubmed') || url.includes('ncbi.nlm.nih.gov')) {
      extractedData = await scrapePubMed(url);
    } else if (url.includes('scholar.google.com')) {
      extractedData = await scrapeGoogleScholar(url);
    } else if (url.includes('semanticscholar.org')) {
      extractedData = await scrapeSemanticScholar(url);
    } else if (url.includes('.pdf')) {
      // Direct PDF link - try to get the HTML version or abstract page
      extractedData = await scrapePDFAlternative(url);
    } else {
      // Generic scraper for other academic sites
      extractedData = await scrapeGeneric(url);
    }

    if (!extractedData || !extractedData.content) {
      return res.status(400).json({
        error: 'Could not extract content from the URL. Try providing the abstract or HTML version of the paper instead of the PDF link.'
      });
    }

    // Process the extracted content into chunks
    const chunks = processTextIntoChunks(extractedData.content, extractedData.title || url, url);

    console.log(`Adding ${chunks.length} chunks to vector store for user ${userId}, session ${sessionId}`);
    // Add to vector store with session ID AND user ID for isolation
    const result = await addDocumentsToStore(chunks, sessionId, userId);

    res.status(200).json({
      success: true,
      title: extractedData.title || 'Untitled Document',
      authors: extractedData.authors || [],
      abstract: extractedData.abstract || '',
      chunksAdded: result.count,
      source: url
    });

  } catch (error) {
    console.error('Scraping error:', error);

    // Provide more specific error messages
    let errorMessage = 'Failed to scrape content';
    if (error.response) {
      if (error.response.status === 403) {
        errorMessage = 'Access denied by the website. Try using the direct paper link or uploading the PDF file instead.';
      } else if (error.response.status === 404) {
        errorMessage = 'Page not found. Please check the URL and try again.';
      } else {
        errorMessage = `Server responded with error ${error.response.status}`;
      }
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Could not connect to the website. Please check the URL.';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Request timed out. The website might be slow or unavailable.';
    } else {
      errorMessage = error.message || 'Unknown error occurred';
    }

    res.status(500).json({ error: errorMessage });
  }
}

// Scrape arXiv papers
async function scrapeArxiv(url) {
  try {
    // Convert PDF URL to abstract URL if needed
    let abstractUrl = url;
    if (url.includes('/pdf/')) {
      abstractUrl = url.replace('/pdf/', '/abs/').replace('.pdf', '');
    }

    const response = await axios.get(abstractUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    const $ = cheerio.load(response.data);

    const title = $('h1.title').text().replace('Title:', '').trim();
    const authors = $('.authors a').map((_, el) => $(el).text()).get();
    const abstract = $('.abstract').text().replace('Abstract:', '').trim();

    // Get the paper content from the abstract and metadata
    let content = `Title: ${title}\n\n`;
    content += `Authors: ${authors.join(', ')}\n\n`;
    content += `Abstract: ${abstract}\n\n`;

    // Try to get additional content from comments/subjects
    const subjects = $('.subjects').text();
    if (subjects) {
      content += `Subjects: ${subjects}\n\n`;
    }

    const comments = $('.comments').text();
    if (comments) {
      content += `Comments: ${comments}\n\n`;
    }

    return {
      title,
      authors,
      abstract,
      content
    };
  } catch (error) {
    console.error('ArXiv scraping error:', error);
    throw error;
  }
}

// Scrape PubMed/NCBI papers
async function scrapePubMed(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    const $ = cheerio.load(response.data);

    const title = $('h1.heading-title, .article-title').first().text().trim();
    const authors = $('.authors-list a, .contrib-group a').map((_, el) => $(el).text()).get();
    const abstract = $('.abstract-content, #abstract').text().trim();

    // Get full text if available
    let content = `Title: ${title}\n\n`;
    content += `Authors: ${authors.join(', ')}\n\n`;
    content += `Abstract: ${abstract}\n\n`;

    // Try to get article sections
    $('.article-section, .sec').each((_, section) => {
      const sectionTitle = $(section).find('h2, h3').first().text();
      const sectionContent = $(section).find('p').text();
      if (sectionTitle && sectionContent) {
        content += `\n${sectionTitle}\n${sectionContent}\n`;
      }
    });

    return {
      title,
      authors,
      abstract,
      content
    };
  } catch (error) {
    console.error('PubMed scraping error:', error);
    throw error;
  }
}

// Scrape Google Scholar
async function scrapeGoogleScholar(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    const $ = cheerio.load(response.data);

    const title = $('.gsc_vcd_title, .gs_rt').first().text().trim();
    const authors = $('.gsc_vcd_field:contains("Authors")').next().text().split(',').map(a => a.trim());
    const abstract = $('.gsc_vcd_field:contains("Description")').next().text().trim();

    let content = `Title: ${title}\n\n`;
    content += `Authors: ${authors.join(', ')}\n\n`;
    content += `Abstract: ${abstract}\n\n`;

    // Get all metadata fields
    $('.gsc_vcd_field').each((_, field) => {
      const fieldName = $(field).text();
      const fieldValue = $(field).next().text();
      if (fieldValue && !content.includes(fieldValue)) {
        content += `${fieldName}: ${fieldValue}\n\n`;
      }
    });

    return {
      title,
      authors,
      abstract,
      content
    };
  } catch (error) {
    console.error('Google Scholar scraping error:', error);
    throw error;
  }
}

// Scrape Semantic Scholar
async function scrapeSemanticScholar(url) {
  try {
    // Extract paper ID from URL
    const paperId = url.match(/\/paper\/[^\/]+\/([a-f0-9]+)/)?.[1];

    if (paperId) {
      // Use Semantic Scholar API
      const apiUrl = `https://api.semanticscholar.org/v1/paper/${paperId}`;
      const response = await axios.get(apiUrl);
      const data = response.data;

      const title = data.title;
      const authors = data.authors?.map(a => a.name) || [];
      const abstract = data.abstract || '';

      let content = `Title: ${title}\n\n`;
      content += `Authors: ${authors.join(', ')}\n\n`;
      content += `Abstract: ${abstract}\n\n`;
      content += `Year: ${data.year || 'N/A'}\n\n`;
      content += `Venue: ${data.venue || 'N/A'}\n\n`;

      return {
        title,
        authors,
        abstract,
        content
      };
    } else {
      // Fallback to HTML scraping
      return scrapeGeneric(url);
    }
  } catch (error) {
    console.error('Semantic Scholar scraping error:', error);
    // Fallback to generic scraper
    return scrapeGeneric(url);
  }
}

// Handle direct PDF links by finding alternative versions
async function scrapePDFAlternative(url) {
  // Try to find the HTML or abstract version
  if (url.includes('arxiv.org')) {
    const abstractUrl = url.replace('/pdf/', '/abs/').replace('.pdf', '');
    return scrapeArxiv(abstractUrl);
  }

  // For other PDFs, extract what we can from the URL and page
  return {
    title: 'PDF Document',
    authors: [],
    abstract: 'Direct PDF link - please provide the abstract or HTML page URL instead for better results',
    content: `Source: ${url}\n\nThis is a direct PDF link. For better text extraction, please provide the abstract or HTML version of this paper.`
  };
}

// Generic scraper for any academic website
async function scrapeGeneric(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 15000,
      maxRedirects: 5
    });

    const $ = cheerio.load(response.data);

    // Remove script and style elements
    $('script, style, noscript').remove();

    // Try common selectors for academic papers
    const title = $('h1, .title, .article-title, [itemprop="name"]').first().text().trim() ||
                  $('meta[property="og:title"]').attr('content') ||
                  $('title').text().trim();

    const authors = $('.authors, .author-list, .contributors, [itemprop="author"]').text().trim() ||
                    $('meta[name="author"]').map((_, el) => $(el).attr('content')).get().join(', ');

    const abstract = $('.abstract, #abstract, .summary, [itemprop="description"]').text().trim() ||
                    $('meta[name="description"]').attr('content') ||
                    $('meta[property="og:description"]').attr('content');

    // Get main content
    let content = `Title: ${title}\n\n`;

    if (authors) {
      content += `Authors: ${authors}\n\n`;
    }

    if (abstract) {
      content += `Abstract: ${abstract}\n\n`;
    }

    // Try to get article body
    const articleBody = $('article, .article-content, .paper-content, main').text().trim();
    if (articleBody && articleBody.length > (abstract?.length || 0)) {
      content += `Content:\n${articleBody}\n`;
    } else {
      // Fallback to all paragraph text
      const paragraphs = $('p').map((_, el) => $(el).text().trim()).get()
        .filter(text => text.length > 50) // Filter out short paragraphs
        .join('\n\n');

      if (paragraphs) {
        content += `Content:\n${paragraphs}\n`;
      }
    }

    return {
      title: title || 'Untitled',
      authors: authors ? [authors] : [],
      abstract: abstract || '',
      content
    };
  } catch (error) {
    console.error('Generic scraping error:', error);
    throw error;
  }
}

// Process text into chunks for vector store
function processTextIntoChunks(text, title, source) {
  const chunks = [];
  const chunkSize = 1000;
  const overlap = 200;

  // Clean up the text
  const cleanedText = text
    .replace(/\s+/g, ' ')
    .replace(/[\r\n]+/g, '\n')
    .trim();

  if (!cleanedText || cleanedText.length < 10) {
    return chunks;
  }

  // Split into paragraphs first
  const paragraphs = cleanedText.split(/\n\n+/);
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        metadata: {
          source: title,
          url: source,
          type: "web-scrape",
        },
      });

      // Start new chunk with overlap
      const words = currentChunk.split(' ');
      const overlapWords = words.slice(-30).join(' ');
      currentChunk = overlapWords + ' ' + paragraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }

    if (currentChunk.length >= chunkSize) {
      chunks.push({
        content: currentChunk.slice(0, chunkSize).trim(),
        metadata: {
          source: title,
          url: source,
          type: "web-scrape",
        },
      });
      currentChunk = currentChunk.slice(chunkSize - overlap);
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 10) {
    chunks.push({
      content: currentChunk.trim(),
      metadata: {
        source: title,
        url: source,
        type: "web-scrape",
      },
    });
  }

  return chunks;
}