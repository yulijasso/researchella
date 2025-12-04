import { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Box, VStack, HStack, Text, IconButton, Spinner } from '@chakra-ui/react';
import { FiChevronLeft, FiChevronRight, FiZoomIn, FiZoomOut } from 'react-icons/fi';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PdfViewerWithHighlight({ pdfData, pageNumber = 1, highlightText = '', boundingBoxes = null }) {
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(pageNumber);
  const [scale, setScale] = useState(1.5);
  const [pageLoaded, setPageLoaded] = useState(false);
  const pageRef = useRef(null);

  useEffect(() => {
    setCurrentPage(pageNumber);
  }, [pageNumber]);

  useEffect(() => {
    if (pageLoaded && (highlightText || boundingBoxes) && pageRef.current) {
      // Small delay to ensure text layer is rendered
      const timer = setTimeout(() => {
        performHighlight();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [pageLoaded, highlightText, boundingBoxes, currentPage, scale]);

  function onDocumentLoadSuccess(pdf) {
    setNumPages(pdf.numPages);
  }

  function onPageLoadSuccess() {
    setPageLoaded(true);
  }

  // Normalize text for comparison (keeps spaces)
  function normalizeText(str) {
    return str
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"')
      .trim();
  }

  // Remove all spaces for space-agnostic comparison
  function removeAllSpaces(str) {
    return str.toLowerCase().replace(/\s+/g, '').replace(/[^\w]/g, '');
  }

  // Extract search strings from highlight text
  function extractSearchStrings(text) {
    if (!text) return [];

    // Use space-removed version for matching
    const noSpaces = removeAllSpaces(text);
    const searches = [];

    // Extract unique words/phrases that are likely to match
    // Split into words and find distinctive sequences
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);

    // Try consecutive word sequences (more likely to be unique)
    for (let len = 4; len >= 2; len--) {
      for (let i = 0; i <= words.length - len; i++) {
        const phrase = words.slice(i, i + len).join('').replace(/[^\w]/g, '');
        if (phrase.length >= 15 && phrase.length <= 60) {
          searches.push(phrase);
          if (searches.length >= 5) break;
        }
      }
      if (searches.length >= 5) break;
    }

    // Also add windows from the full text as fallback
    const windowSizes = [40, 30, 20];
    for (const size of windowSizes) {
      if (noSpaces.length >= size) {
        searches.push(noSpaces.substring(0, size));
        if (noSpaces.length > size * 2) {
          const mid = Math.floor(noSpaces.length / 2);
          searches.push(noSpaces.substring(mid, mid + size));
        }
      }
    }

    console.log('Search strings:', searches.length, 'from text length:', text.length);
    return [...new Set(searches)]; // Remove duplicates
  }

  // Bounding box based highlighting (most accurate)
  function performBoundingBoxHighlight(textLayer, boxes) {
    const containerRect = textLayer.getBoundingClientRect();
    let firstHighlight = null;
    let highlightCount = 0;

    // pdf2json coordinates are in a different scale - convert to pixels
    // pdf2json uses 1/72 inch units, at 96 DPI that's 96/72 = 1.333 pixels per unit
    const PDF_SCALE = scale * 72; // Adjust for current zoom level

    boxes.forEach((box, idx) => {
      // Convert pdf2json coordinates to screen pixels
      const left = box.x * PDF_SCALE;
      const top = box.y * PDF_SCALE;
      const width = box.w * PDF_SCALE;
      const height = box.h * PDF_SCALE;

      const highlight = document.createElement('div');
      highlight.className = 'pdf-highlight';
      highlight.style.cssText = `
        position: absolute;
        left: ${left}px;
        top: ${top}px;
        width: ${Math.max(width, 20)}px;
        height: ${Math.max(height, 15)}px;
        background-color: rgba(251, 191, 36, 0.4);
        border-radius: 2px;
        pointer-events: none;
        z-index: 1;
      `;

      textLayer.appendChild(highlight);
      highlightCount++;

      if (!firstHighlight) {
        firstHighlight = highlight;
      }
    });

    // Scroll to first highlight
    if (firstHighlight) {
      setTimeout(() => {
        firstHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }

    console.log(`Highlighted ${highlightCount} bounding boxes on page ${currentPage}`);
  }

  function performHighlight() {
    if (!pageRef.current || (!highlightText && !boundingBoxes)) {
      console.log('No highlight - pageRef:', !!pageRef.current, 'highlightText:', highlightText?.substring(0, 50));
      return;
    }

    const textLayer = pageRef.current.querySelector('.react-pdf__Page__textContent');
    if (!textLayer) {
      console.log('No text layer found');
      return;
    }

    // Remove existing highlights first
    const existingHighlights = textLayer.querySelectorAll('.pdf-highlight');
    existingHighlights.forEach(el => el.remove());

    // Try bounding box highlighting first (most accurate)
    if (boundingBoxes && boundingBoxes.length > 0) {
      console.log('Using bounding box highlighting with', boundingBoxes.length, 'boxes');
      performBoundingBoxHighlight(textLayer, boundingBoxes);
      return;
    }

    console.log('Starting text-based highlight with:', highlightText.substring(0, 100));

    // Get all text spans and build the full page text
    const textSpans = Array.from(textLayer.querySelectorAll('span[role="presentation"]'));
    if (textSpans.length === 0) return;

    // Build full page text with span indices
    let fullPageText = '';
    const spanPositions = [];
    textSpans.forEach((span, idx) => {
      const text = span.textContent || '';
      spanPositions.push({
        start: fullPageText.length,
        end: fullPageText.length + text.length,
        span: span,
        text: text
      });
      fullPageText += text + ' ';
    });

    const normalizedPageText = normalizeText(fullPageText);
    const noSpacesPageText = removeAllSpaces(fullPageText);
    const searches = extractSearchStrings(highlightText);

    let highlightCount = 0;
    let firstHighlight = null;
    const highlightedSpans = new Set();

    // Build a map of character positions to spans (space-agnostic)
    let charToSpan = [];
    let noSpaceCharToOriginal = []; // Maps no-space index to original span
    textSpans.forEach((span) => {
      const text = span.textContent || '';
      for (let i = 0; i < text.length; i++) {
        charToSpan.push({ span, charIndex: i });
        // Only add to noSpaceCharToOriginal if it's an alphanumeric character
        const char = text[i].toLowerCase();
        if (/\w/.test(char)) {
          noSpaceCharToOriginal.push({ span, charIndex: i, originalIndex: charToSpan.length - 1 });
        }
      }
      charToSpan.push({ span: null, charIndex: -1 }); // space between spans
    });

    // Find first matching search string using space-agnostic comparison
    let matchIndex = -1;
    let matchedSearch = '';
    for (const search of searches) {
      matchIndex = noSpacesPageText.indexOf(search);
      if (matchIndex !== -1) {
        matchedSearch = search;
        console.log(`Found match at ${matchIndex}: "${search.substring(0, 40)}..."`);
        break;
      }
    }

    if (matchIndex === -1) {
      // Fallback: try even shorter sequences (10-15 chars)
      const noSpacesHighlight = removeAllSpaces(highlightText);
      const shortSearches = [];
      for (let i = 0; i < noSpacesHighlight.length - 10; i += 10) {
        shortSearches.push(noSpacesHighlight.substring(i, i + 12));
      }
      for (const search of shortSearches) {
        matchIndex = noSpacesPageText.indexOf(search);
        if (matchIndex !== -1) {
          matchedSearch = search;
          console.log(`Found fallback match at ${matchIndex}: "${search}"`);
          break;
        }
      }

      if (matchIndex === -1) {
        console.log('❌ NO MATCH FOUND');
        console.log('   Search strings tried:', searches.length + shortSearches.length);
        return;
      }
    }

    // Use the noSpaceCharToOriginal mapping to find spans to highlight
    // Use the FULL highlight text length, not just the matched search pattern
    const noSpacesHighlight = removeAllSpaces(highlightText);
    let start = matchIndex;
    let end = matchIndex + noSpacesHighlight.length;

    // Don't expand - highlight EXACTLY the matched text
    start = Math.max(0, start);
    end = Math.min(noSpaceCharToOriginal.length, end);

    // Highlight all spans in the matched range
    for (let i = start; i < end && i < noSpaceCharToOriginal.length; i++) {
      const entry = noSpaceCharToOriginal[i];
      if (!entry?.span || highlightedSpans.has(entry.span)) continue;

      const span = entry.span;
      const spanRect = span.getBoundingClientRect();
      const containerRect = textLayer.getBoundingClientRect();

      const highlight = document.createElement('div');
      highlight.className = 'pdf-highlight';
      highlight.style.cssText = `
        position: absolute;
        left: ${spanRect.left - containerRect.left}px;
        top: ${spanRect.top - containerRect.top}px;
        width: ${spanRect.width}px;
        height: ${spanRect.height}px;
        background-color: rgba(251, 191, 36, 0.4);
        border-radius: 2px;
        pointer-events: none;
        z-index: 1;
      `;

      textLayer.appendChild(highlight);
      highlightedSpans.add(span);
      highlightCount++;

      if (!firstHighlight) {
        firstHighlight = span;
      }
    }

    // Scroll to first highlight
    if (firstHighlight) {
      setTimeout(() => {
        firstHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }

    console.log(`Highlighted ${highlightCount} spans on page ${currentPage}`);
  }

  return (
    <VStack h="100%" gap={0} bg="gray.700">
      {/* Controls */}
      <HStack
        w="100%"
        px={4}
        py={2}
        bg="gray.900"
        justify="space-between"
        borderBottom="1px solid"
        borderColor="gray.700"
      >
        <HStack gap={2}>
          <IconButton
            icon={<FiChevronLeft size={18} />}
            size="sm"
            variant="solid"
            bg="gray.600"
            color="white"
            _hover={{ bg: "gray.500" }}
            _disabled={{ opacity: 0.3, cursor: "not-allowed" }}
            onClick={() => {
              setPageLoaded(false);
              setCurrentPage(Math.max(1, currentPage - 1));
            }}
            isDisabled={currentPage <= 1}
            aria-label="Previous page"
          />
          <Text color="white" fontSize="sm" minW="120px" textAlign="center">
            Page {currentPage} of {numPages || '...'}
          </Text>
          <IconButton
            icon={<FiChevronRight size={18} />}
            size="sm"
            variant="solid"
            bg="gray.600"
            color="white"
            _hover={{ bg: "gray.500" }}
            _disabled={{ opacity: 0.3, cursor: "not-allowed" }}
            onClick={() => {
              setPageLoaded(false);
              setCurrentPage(Math.min(numPages || 1, currentPage + 1));
            }}
            isDisabled={currentPage >= (numPages || 1)}
            aria-label="Next page"
          />
        </HStack>

        <HStack gap={2}>
          <IconButton
            icon={<FiZoomOut size={18} />}
            size="sm"
            variant="solid"
            bg="gray.600"
            color="white"
            _hover={{ bg: "gray.500" }}
            onClick={() => {
              setPageLoaded(false);
              setScale(Math.max(0.5, scale - 0.25));
            }}
            aria-label="Zoom out"
          />
          <Text color="white" fontSize="sm" minW="60px" textAlign="center">
            {Math.round(scale * 100)}%
          </Text>
          <IconButton
            icon={<FiZoomIn size={18} />}
            size="sm"
            variant="solid"
            bg="gray.600"
            color="white"
            _hover={{ bg: "gray.500" }}
            onClick={() => {
              setPageLoaded(false);
              setScale(Math.min(3, scale + 0.25));
            }}
            aria-label="Zoom in"
          />
        </HStack>
      </HStack>

      {/* PDF Viewer */}
      <Box
        flex={1}
        w="100%"
        overflowY="auto"
        overflowX="auto"
        display="flex"
        justifyContent="center"
        alignItems="flex-start"
        py={4}
        css={{
          '&::-webkit-scrollbar': { width: '12px', height: '12px' },
          '&::-webkit-scrollbar-track': { background: '#2D3748' },
          '&::-webkit-scrollbar-thumb': { background: '#4A5568', borderRadius: '6px' },
          '&::-webkit-scrollbar-thumb:hover': { background: '#718096' },
        }}
      >
        <Box ref={pageRef}>
          <Document
            file={pdfData}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <VStack py={20}>
                <Spinner size="xl" color="blue.500" />
                <Text color="white" fontSize="sm">Loading PDF...</Text>
              </VStack>
            }
            error={
              <VStack py={20}>
                <Text color="red.400" fontSize="sm">Failed to load PDF</Text>
              </VStack>
            }
          >
            <Page
              key={`page-${currentPage}-${scale}`}
              pageNumber={currentPage}
              scale={scale}
              onLoadSuccess={onPageLoadSuccess}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              loading={
                <Box py={20}>
                  <Spinner size="lg" color="blue.500" />
                </Box>
              }
            />
          </Document>
        </Box>
      </Box>
    </VStack>
  );
}
