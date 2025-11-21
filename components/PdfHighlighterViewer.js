import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, VStack, HStack, Text, IconButton, Spinner } from '@chakra-ui/react';
import { FiChevronLeft, FiChevronRight, FiZoomIn, FiZoomOut } from 'react-icons/fi';

// Use dynamic import to avoid SSR issues
let pdfjsLib = null;
if (typeof window !== 'undefined') {
  pdfjsLib = require('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

export default function PdfHighlighterViewer({ pdfData, pageNumber = 1, highlightText = '' }) {
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(pageNumber);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.5);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);

  // Load PDF document
  useEffect(() => {
    if (!pdfData || !pdfjsLib) return;

    let isMounted = true;
    let loadingTask = null;

    setLoading(true);
    loadingTask = pdfjsLib.getDocument(pdfData);
    loadingTask.promise.then((pdf) => {
      if (isMounted) {
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        setLoading(false);
      }
    }).catch((err) => {
      if (isMounted && err.name !== 'PasswordException' && !err.message?.includes('destroyed')) {
        console.error('Error loading PDF:', err);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      if (loadingTask) {
        loadingTask.destroy?.().catch(() => {});
      }
    };
  }, [pdfData]);

  // Update page when prop changes
  useEffect(() => {
    if (pageNumber && pageNumber !== currentPage) {
      setCurrentPage(pageNumber);
    }
  }, [pageNumber]);

  // Render page
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current || rendering || !pdfjsLib) return;

    setRendering(true);
    try {
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise;

      // Render text layer for search/highlight
      if (textLayerRef.current) {
        textLayerRef.current.innerHTML = '';
        textLayerRef.current.style.width = `${viewport.width}px`;
        textLayerRef.current.style.height = `${viewport.height}px`;

        const textContent = await page.getTextContent();

        // Create text layer items
        textContent.items.forEach((item) => {
          const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
          const span = document.createElement('span');
          span.textContent = item.str;
          span.style.position = 'absolute';
          span.style.left = `${tx[4]}px`;
          span.style.top = `${tx[5] - item.height}px`;
          span.style.fontSize = `${item.height}px`;
          span.style.fontFamily = item.fontName || 'sans-serif';
          span.style.color = 'transparent';
          span.style.whiteSpace = 'pre';
          span.dataset.text = item.str.toLowerCase();
          textLayerRef.current.appendChild(span);
        });

        // Highlight matching text
        if (highlightText) {
          highlightMatchingText(highlightText);
        }
      }
    } catch (err) {
      if (!err.message?.includes('destroyed') && !err.message?.includes('cancelled')) {
        console.error('Error rendering page:', err);
      }
    }
    setRendering(false);
  }, [pdfDoc, currentPage, scale, highlightText]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  // Highlight matching text in text layer
  const highlightMatchingText = (searchText) => {
    if (!textLayerRef.current || !searchText) return;

    const spans = textLayerRef.current.querySelectorAll('span');
    const searchLower = searchText.toLowerCase().replace(/\s+/g, ' ').trim();

    // Get words to search for (use first few significant words)
    const searchWords = searchLower.split(' ').filter(w => w.length > 3).slice(0, 5);
    if (searchWords.length === 0) return;

    let highlighted = false;
    let firstMatch = null;

    spans.forEach((span) => {
      const spanText = span.dataset.text || '';

      // Check if span contains any search words
      const hasMatch = searchWords.some(word => spanText.includes(word));

      if (hasMatch) {
        span.style.backgroundColor = 'rgba(251, 191, 36, 0.5)';
        span.style.color = 'transparent';
        span.style.borderRadius = '2px';
        highlighted = true;

        if (!firstMatch) {
          firstMatch = span;
        }
      }
    });

    // Scroll to first match
    if (firstMatch) {
      setTimeout(() => {
        firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      console.log(`Highlighted text on page ${currentPage}`);
    } else {
      console.log('No matches found for:', searchWords.join(', '));
    }
  };

  if (loading) {
    return (
      <VStack h="100%" justify="center" bg="gray.700">
        <Spinner size="xl" color="blue.500" />
        <Text color="white">Loading PDF...</Text>
      </VStack>
    );
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
            icon={<FiChevronLeft />}
            size="sm"
            variant="ghost"
            colorScheme="whiteAlpha"
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            isDisabled={currentPage <= 1}
            aria-label="Previous page"
          />
          <Text color="white" fontSize="sm" minW="120px" textAlign="center">
            Page {currentPage} of {numPages || '...'}
          </Text>
          <IconButton
            icon={<FiChevronRight />}
            size="sm"
            variant="ghost"
            colorScheme="whiteAlpha"
            onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
            isDisabled={currentPage >= numPages}
            aria-label="Next page"
          />
        </HStack>

        <HStack gap={2}>
          <IconButton
            icon={<FiZoomOut />}
            size="sm"
            variant="ghost"
            colorScheme="whiteAlpha"
            onClick={() => setScale(Math.max(0.5, scale - 0.25))}
            aria-label="Zoom out"
          />
          <Text color="white" fontSize="sm" minW="60px" textAlign="center">
            {Math.round(scale * 100)}%
          </Text>
          <IconButton
            icon={<FiZoomIn />}
            size="sm"
            variant="ghost"
            colorScheme="whiteAlpha"
            onClick={() => setScale(Math.min(3, scale + 0.25))}
            aria-label="Zoom in"
          />
        </HStack>
      </HStack>

      {/* PDF Canvas */}
      <Box
        flex={1}
        w="100%"
        overflow="auto"
        display="flex"
        justifyContent="center"
        alignItems="flex-start"
        py={4}
        position="relative"
      >
        <Box position="relative">
          <canvas ref={canvasRef} style={{ display: 'block' }} />
          <Box
            ref={textLayerRef}
            position="absolute"
            top={0}
            left={0}
            pointerEvents="none"
          />
          {rendering && (
            <Box
              position="absolute"
              top="50%"
              left="50%"
              transform="translate(-50%, -50%)"
            >
              <Spinner color="blue.500" />
            </Box>
          )}
        </Box>
      </Box>
    </VStack>
  );
}
