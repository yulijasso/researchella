import Head from "next/head";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import dynamic from 'next/dynamic';
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  IconButton,
  Text,
  VStack,
  HStack,
  SimpleGrid,
  Card,
  Textarea,
  Spacer,
  Stack,
  Spinner,
  Popover,
} from "@chakra-ui/react";
import { FiMenu, FiPlus, FiSun, FiMoon, FiSend, FiX, FiUpload, FiFile, FiLink, FiCheck, FiArrowLeft, FiImage, FiExternalLink, FiTrash2 } from "react-icons/fi";
import { useColorMode } from "@/components/ui/color-mode";
import { toaster } from "@/components/ui/toaster";
import { useAuth } from "@/contexts/AuthContext";

// Dynamically import PDF viewer to avoid SSR issues
const PdfViewerWithHighlight = dynamic(() => import('../components/PdfViewerWithHighlight'), {
  ssr: false,
  loading: () => <Box h="100%" display="flex" alignItems="center" justifyContent="center"><Spinner size="xl" color="blue.500" /></Box>
});

export default function Chat() {
  const router = useRouter();
  const { session: sessionId } = router.query;
  const [sessionName, setSessionName] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { colorMode, toggleColorMode } = useColorMode();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [selectedImages, setSelectedImages] = useState([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [allCitations, setAllCitations] = useState([]);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [abortController, setAbortController] = useState(null);
  const [selectedSources, setSelectedSources] = useState([]); // Track which sources are selected
  const [audioOverviewOpen, setAudioOverviewOpen] = useState(false);
  const [audioOverview, setAudioOverview] = useState(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [studioModalOpen, setStudioModalOpen] = useState(false);
  const [studioContent, setStudioContent] = useState(null);
  const [studioType, setStudioType] = useState('');
  const [isGeneratingStudio, setIsGeneratingStudio] = useState(false);
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
  const [showFlashcardAnswer, setShowFlashcardAnswer] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [showQuizResults, setShowQuizResults] = useState(false);
  const [pdfViewerVisible, setPdfViewerVisible] = useState(false);
  const [currentPdfData, setCurrentPdfData] = useState(null);
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [currentHighlightText, setCurrentHighlightText] = useState("");
  const [tutoringMode, setTutoringMode] = useState("direct"); // "direct" or "interactive"

  // Load session data from Supabase
  useEffect(() => {
    // Cancel any pending requests when switching sessions
    if (abortController) {
      console.log('Cancelling pending requests from previous session');
      abortController.abort();
      setAbortController(null);
    }

    if (sessionId) {
      // Clear EVERYTHING immediately to prevent contamination
      setAllCitations([]);
      setMessages([]);
      setUploadedFiles([]);
      setIsLoading(false);

      const loadSessionData = async () => {
        try {
          // Load session info
          const sessionResponse = await fetch(`/api/sessions`);
          if (sessionResponse.ok) {
            const { sessions } = await sessionResponse.json();
            const session = sessions.find(s => s.id === sessionId);
            if (session) {
              setSessionName(session.name);
            }
          }

          // Load messages for this session
          const messagesResponse = await fetch(`/api/messages?session_id=${sessionId}`);
          if (messagesResponse.ok) {
            const { messages: loadedMessages } = await messagesResponse.json();
            setMessages(loadedMessages || []);

            // Extract citations from loaded messages
            const citations = loadedMessages
              .filter(m => m.citations)
              .flatMap(m => m.citations);
            setAllCitations(citations);
          }

          // Load uploaded files for this session
          const filesResponse = await fetch(`/api/files?session_id=${sessionId}`);
          if (filesResponse.ok) {
            const { files } = await filesResponse.json();
            // Map database fields to frontend format
            const mappedFiles = (files || []).map(f => ({
              name: f.name,
              chunks: f.chunks,
              type: f.type,
              isPDF: f.type === 'application/pdf' || f.name?.endsWith('.pdf'),
              pdfData: f.pdf_data,
              pages: f.pages,
            }));
            setUploadedFiles(mappedFiles);
          }
        } catch (error) {
          console.error('Error loading session data:', error);
        }
      };

      loadSessionData();
    }
  }, [sessionId]);

  // Messages are now saved to Supabase when created (see sendMessage function)
  // No need for auto-save - messages persist in database immediately

  const suggestedPrompts = [
    {
      title: "Research Papers",
      description: "Find and analyze academic papers on a specific topic",
    },
    {
      title: "Literature Review",
      description: "Help me conduct a systematic literature review",
    },
    {
      title: "Citation Analysis",
      description: "Analyze citation patterns and research impact",
    },
    {
      title: "Paper Summary",
      description: "Summarize key findings from research papers",
    },
    {
      title: "Research Trends",
      description: "Identify emerging trends in my field of study",
    },
    {
      title: "Reference Manager",
      description: "Organize and manage my research references",
    },
  ];

  const handleUrlSubmit = async (urlToSubmit) => {
    const url = urlToSubmit || urlInput;
    if (!url || !url.trim()) return;

    setIsUploading(true);

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: url,
          sessionId: sessionId  // Add session ID for isolation
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to scrape URL");
      }

      const data = await response.json();
      setUploadedFiles([...uploadedFiles, { name: data.title, chunks: data.chunksAdded, url: url }]);

      // Add system message about successful scraping
      setMessages([
        ...messages,
        {
          role: "system",
          content: `🔗 Successfully scraped "${data.title}" from ${url} (${data.chunksAdded} chunks added to knowledge base)`,
        },
      ]);

      // Show success toast
      toaster.create({
        title: "Paper Added Successfully",
        description: `"${data.title}" has been added to your knowledge base (${data.chunksAdded} chunks)`,
        status: "success",
        duration: 5000,
      });

      setUrlInput("");
      setShowUrlInput(false);
    } catch (error) {
      console.error("URL scraping error:", error);
      toaster.create({
        title: "Failed to Add Paper",
        description: error.message || "Could not scrape the URL. Please try a different link or upload the PDF directly.",
        status: "error",
        duration: 7000,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sessionId", sessionId); // Add session ID for isolation

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload file");
      }

      const data = await response.json();

      // Store file with additional metadata including file data for PDF viewing
      const fileData = {
        name: file.name,
        chunks: data.chunksAdded,
        type: file.type,
        isPDF: file.type === 'application/pdf'
      };

      // If it's a PDF, convert to base64 for storage and viewing
      if (file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = (e) => {
          fileData.pdfData = e.target.result;
          setUploadedFiles([...uploadedFiles, fileData]);
        };
        reader.readAsDataURL(file);
      } else {
        setUploadedFiles([...uploadedFiles, fileData]);
      }

      // Add system message about successful upload
      setMessages([
        ...messages,
        {
          role: "system",
          content: `📄 Successfully uploaded and processed "${file.name}" (${data.chunksAdded} chunks added to knowledge base)${data.method === 'GPT-4 Vision' ? ' using GPT-4 Vision' : ''}`,
        },
      ]);

      // Show success toast
      toaster.create({
        title: "Document Uploaded Successfully",
        description: `"${file.name}" has been processed (${data.chunksAdded} chunks)${data.method === 'GPT-4 Vision' ? ' using GPT-4 Vision' : ''}`,
        status: "success",
        duration: 5000,
      });

      // Reset file input
      event.target.value = "";
    } catch (error) {
      console.error("Upload error:", error);
      toaster.create({
        title: "Upload Failed",
        description: "Failed to process the document. If it's a PDF with custom fonts, try uploading the paper from its URL instead.",
        status: "error",
        duration: 7000,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteFile = (index) => {
    const updatedFiles = uploadedFiles.filter((_, idx) => idx !== index);
    setUploadedFiles(updatedFiles);

    // Add system message about deletion
    setMessages([
      ...messages,
      {
        role: "system",
        content: `🗑️ Removed "${uploadedFiles[index].name}" from sources`,
      },
    ]);

    toaster.create({
      title: "Source Removed",
      description: `"${uploadedFiles[index].name}" has been removed from sources`,
      status: "info",
      duration: 3000,
    });
  };

  const handleImageUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    setIsUploadingImage(true);

    try {
      const uploadPromises = files.map(async (file) => {
        const formData = new FormData();
        formData.append("image", file);

        const response = await fetch("/api/upload-image", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("Failed to upload image");
        }

        const data = await response.json();
        return {
          url: data.url,
          base64: data.base64,
          fileName: data.fileName,
        };
      });

      const uploadedImages = await Promise.all(uploadPromises);
      setSelectedImages([...selectedImages, ...uploadedImages]);

      toaster.create({
        title: "Images Uploaded",
        description: `${uploadedImages.length} image(s) ready to send`,
        status: "success",
        duration: 3000,
      });

      event.target.value = "";
    } catch (error) {
      console.error("Image upload error:", error);
      toaster.create({
        title: "Upload Failed",
        description: error.message,
        status: "error",
        duration: 5000,
      });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const removeImage = (index) => {
    setSelectedImages(selectedImages.filter((_, i) => i !== index));
  };

  const generateAudioOverview = async () => {
    setIsGeneratingAudio(true);
    try {
      const response = await fetch("/api/generate-audio-overview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: sessionId,
          selectedSources: selectedSources,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate audio overview");
      }

      const data = await response.json();
      setAudioOverview(data);
      setAudioOverviewOpen(true);

      toaster.create({
        title: "Audio Overview Generated",
        description: "Your podcast-style discussion is ready!",
        status: "success",
        duration: 3000,
      });
    } catch (error) {
      console.error("Audio overview error:", error);
      toaster.create({
        title: "Generation Failed",
        description: error.message || "Could not generate audio overview",
        status: "error",
        duration: 5000,
      });
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const generateStudioContent = async (type) => {
    setIsGeneratingStudio(true);
    setStudioType(type);

    try {
      const endpoints = {
        mindmap: '/api/generate-mindmap',
        flashcards: '/api/generate-flashcards',
        quiz: '/api/generate-quiz',
        report: '/api/generate-report'
      };

      const response = await fetch(endpoints[type], {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate ${type}`);
      }

      const data = await response.json();
      setStudioContent(data);
      setStudioModalOpen(true);
      setCurrentFlashcardIndex(0);
      setShowFlashcardAnswer(false);
      setQuizAnswers({});
      setShowQuizResults(false);

      toaster.create({
        title: `${type.charAt(0).toUpperCase() + type.slice(1)} Generated`,
        description: "Your study material is ready!",
        status: "success",
        duration: 3000,
      });
    } catch (error) {
      console.error(`${type} generation error:`, error);
      toaster.create({
        title: "Generation Failed",
        description: error.message || `Could not generate ${type}`,
        status: "error",
        duration: 5000,
      });
    } finally {
      setIsGeneratingStudio(false);
    }
  };

  const handleCitationClick = async (citationId) => {
    const citation = allCitations.find(c => c.id === citationId);
    if (citation) {
      // Find the uploaded file to get PDF data
      const uploadedFile = uploadedFiles.find(f => f.name === citation.source);

      if (!uploadedFile) {
        toaster.create({
          title: "File not found",
          description: `Could not find ${citation.source}. Try re-uploading the file.`,
          type: "error",
          duration: 5000,
        });
        return;
      }

      // Find the AI's claim (sentence before citation)
      let claimText = '';
      const assistantMessages = messages.filter(m => m.role === 'assistant');
      for (const msg of assistantMessages) {
        const messageText = typeof msg.content === 'string' ? msg.content : '';
        // Try both formats: [CHUNK-X] and superscript number
        const patterns = [
          new RegExp(`([^.!?]*[.!?]?)\\s*\\[CHUNK-${citationId}[^\\]]*\\]`, 'g'),
          new RegExp(`([^.!?]*[.!?]?)\\s*${citationId}`, 'g')
        ];

        for (const pattern of patterns) {
          const match = pattern.exec(messageText);
          if (match && match[1]) {
            claimText = match[1].trim();
            console.log(`Found claim for citation ${citationId}: "${claimText}"`);
            break;
          }
        }
        if (claimText) break;
      }

      if (!claimText) {
        console.log(`No claim found for citation ${citationId}`);
      }

      // Default to showing full chunk first
      let extractedQuote = citation.content;  // Use full chunk as fallback

      if (claimText) {
        console.log(`Calling extraction API for claim: "${claimText.substring(0, 50)}..."`);
        try {
          // Show loading
          setSelectedDocument({
            name: citation.source,
            page: citation.page,
            type: citation.type,
            content: citation.content,
            highlight: "Extracting relevant quote...",
            isLoading: true,
            boundingBoxes: citation.boundingBoxes || null,
            isPDF: uploadedFile?.isPDF || citation.source?.endsWith('.pdf'),
            pdfData: uploadedFile?.pdfData || null,
          });
          setDocumentModalOpen(true);

          // Call extraction API
          const response = await fetch("/api/extract-quote", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              claim: claimText,
              chunkContent: citation.content
            }),
          });

          if (response.ok) {
            const result = await response.json();
            extractedQuote = result.quote;
            console.log(`📝 Extracted quote: "${extractedQuote}"`);
          } else {
            console.error('Extraction API failed:', response.status);
          }
        } catch (error) {
          console.error('Quote extraction error:', error);
          // Keep using full chunk as fallback
        }
      } else {
        console.log('No claim text found, showing full chunk');
      }

      // Update with extracted quote
      setSelectedDocument({
        name: citation.source,
        page: citation.page,
        type: citation.type,
        content: citation.content,
        highlight: extractedQuote,
        isLoading: false,
        boundingBoxes: citation.boundingBoxes || null,
        isPDF: uploadedFile?.isPDF || citation.source?.endsWith('.pdf'),
        pdfData: uploadedFile?.pdfData || null,
      });
    } else {
      toaster.create({
        title: "Citation not found",
        description: "Could not find citation data",
        type: "error",
        duration: 3000,
      });
    }
  };

  // Hover Citation Component - Show verbatim quote or RAG chunk
  const HoverCitation = ({ citationNum, citation, messages }) => {
    const [isOpen, setIsOpen] = useState(false);

    // Fix run-together words for better readability
    const fixRunTogetherWords = (text) => {
      return text
        // Add space between lowercase and uppercase letters (camelCase)
        .replace(/([a-z])([A-Z])/g, '$1 $2')

        // Fix PDF extraction artifacts (specific patterns we see in the data)
        .replace(/Isthe/g, 'Is the')
        .replace(/isthe/g, 'is the')
        .replace(/theimplementation/gi, 'the implementation')
        .replace(/implementationdescribed/gi, 'implementation described')
        .replace(/describedreasonable/gi, 'described reasonable')
        .replace(/descri bed/g, 'described')
        .replace(/theide/gi, 'the ide')
        .replace(/ideaitself/gi, 'idea itself')
        .replace(/itselftechnically/gi, 'itself technically')
        .replace(/aitself/gi, 'a itself')
        .replace(/Analys is/g, 'Analysis')
        .replace(/Whe ther/g, 'Whether')
        .replace(/hypo thes is/g, 'hypothesis')
        .replace(/descri be/g, 'describe')

        // Normalize multiple spaces
        .replace(/\s+/g, ' ')
        .trim();
    };

    // Show the verbatim quote if available, otherwise show chunk preview
    const getDisplayText = () => {
      let text;

      // If we have a verbatim quote, show that (it's what the AI cited)
      if (citation?.quote) {
        text = citation.quote;
      } else if (citation?.content) {
        // Otherwise show chunk preview
        const cleaned = citation.content
          .replace(/\s+/g, ' ')
          .trim();

        const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned];
        text = sentences.slice(0, 2).join(' ').substring(0, 200);
      } else {
        return 'No content available';
      }

      // Fix run-together words before displaying
      return fixRunTogetherWords(text);
    };

    return (
      <Popover.Root
        open={isOpen}
        onOpenChange={setIsOpen}
        positioning={{ placement: 'top' }}
      >
        <Popover.Trigger asChild>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: '11px',
              fontWeight: '400',
              fontFamily: 'Inter, -apple-system, sans-serif',
              color: isOpen ? 'var(--chakra-colors-blue-600)' : 'var(--chakra-colors-gray-600)',
              backgroundColor: 'transparent',
              padding: '0 2px',
              marginLeft: '1px',
              marginRight: '1px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              textDecoration: isOpen ? 'underline' : 'none',
              verticalAlign: 'baseline',
              position: 'relative',
              top: '-0.5em',
              opacity: isOpen ? '1' : '0.8',
            }}
            onMouseEnter={() => setIsOpen(true)}
          >
            {citationNum}
          </span>
        </Popover.Trigger>

        <Popover.Positioner>
          <Popover.Content
            maxW="400px"
            bg="white"
            _dark={{ bg: "gray.800" }}
            boxShadow="lg"
            borderRadius="lg"
            border="1px solid"
            borderColor="gray.200"
            _dark={{ borderColor: "gray.700" }}
            p={0}
            overflow="hidden"
          >
            <Popover.Arrow>
              <Popover.ArrowTip />
            </Popover.Arrow>

            <Box>
              {/* Source Header */}
              <HStack
                px={3}
                py={2}
                bg="gray.50"
                _dark={{ bg: "gray.900" }}
                borderBottom="1px solid"
                borderColor="gray.200"
                _dark={{ borderColor: "gray.700" }}
              >
                <FiFile size="10px" />
                <Text fontSize="xs" color="gray.600" _dark={{ color: "gray.400" }}>
                  {citation?.source || 'Source'}
                  {citation?.page && ` • Page ${citation.page}`}
                  {citation?.lineSpan && ` • ${citation.lineSpan}`}
                </Text>
              </HStack>

              {/* Verbatim Quote or RAG Chunk Content */}
              <Box px={3} py={3}>
                <Text
                  fontSize="xs"
                  color="gray.800"
                  _dark={{ color: "gray.100" }}
                  lineHeight="1.6"
                  fontStyle="italic"
                >
                  "{getDisplayText()}"
                </Text>

                {/* Show confidence indicator only for meaningful scores (50-99%) */}
                {citation?.confidence !== undefined &&
                 citation.confidence >= 0.5 &&
                 citation.confidence < 1 && (
                  <Text fontSize="9px" color="orange.500" mt={1}>
                    ⚠️ Approximate match ({Math.round(citation.confidence * 100)}%)
                  </Text>
                )}

                {/* Show if quote was validated */}
                {citation?.quote && citation.confidence === 1 && (
                  <Text fontSize="9px" color="green.500" mt={1}>
                    ✓ Verbatim quote
                  </Text>
                )}
              </Box>
            </Box>
          </Popover.Content>
        </Popover.Positioner>
      </Popover.Root>
    );
  };

  const highlightText = (text, highlightStr) => {
    if (!highlightStr) return text;

    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Try exact match first
    let regex = new RegExp(`(${escapeRegex(highlightStr)})`, "gi");
    let parts = text.split(regex);

    // If no match found, try matching first 200 chars for flexibility
    if (parts.length === 1 && highlightStr.length > 200) {
      const shortenedHighlight = highlightStr.substring(0, 200);
      regex = new RegExp(`(${escapeRegex(shortenedHighlight)})`, "gi");
      parts = text.split(regex);
    }

    return parts.map((part, index) => {
      const isMatch = part.toLowerCase() === highlightStr.toLowerCase() ||
                     (highlightStr.length > 200 && part.toLowerCase() === highlightStr.substring(0, 200).toLowerCase());

      if (isMatch) {
        return (
          <mark
            key={index}
            id={`highlight-${index}`}
            style={{
              backgroundColor: "#ffeb3b",
              padding: "4px 2px",
              fontWeight: "600",
              borderRadius: "3px",
              boxShadow: "0 0 0 3px rgba(255, 235, 59, 0.3)",
            }}
          >
            {part}
          </mark>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  const renderMessageContent = (msg) => {
    if (msg.role === "user") {
      // Handle user messages with images
      if (Array.isArray(msg.content)) {
        return (
          <VStack align="start" gap={2}>
            {msg.content.map((item, idx) => {
              if (item.type === "text") {
                return <Text key={idx}>{item.text}</Text>;
              } else if (item.type === "image_url") {
                return (
                  <Box key={idx} maxW="300px" borderRadius="md" overflow="hidden">
                    <img src={item.image_url.url} alt="Uploaded" style={{ width: "100%" }} />
                  </Box>
                );
              }
              return null;
            })}
          </VStack>
        );
      }
      return <Text>{msg.content}</Text>;
    }

    // Handle assistant messages with citations
    if (msg.role === "assistant" && msg.citations) {
      const content = msg.content;
      const messageCitations = msg.citations; // Use citations from this message

      // Parse all citation formats and replace with hover citations
      // Matches: [CHUNK-N], [CHUNK-N:S], [CHUNK-N:"verbatim quote"]
      const parts = [];
      let lastIndex = 0;
      const citationRegex = /\[CHUNK-(\d+)(?::"[^"]*"|:[\d,-]+)?\]/g;
      let match;
      let citationIndex = 0; // Track which citation we're on

      while ((match = citationRegex.exec(content)) !== null) {
        // Add text before citation
        if (match.index > lastIndex) {
          parts.push(
            <span key={`text-${lastIndex}`}>
              {content.substring(lastIndex, match.index)}
            </span>
          );
        }

        // Add clean, modern citation
        const citationNum = parseInt(match[1]);

        // Match by order in text, not by ID (multiple citations can have same ID)
        const citation = messageCitations[citationIndex];
        citationIndex++;

        /* Old click-based citation
        parts.push(
          <span
            key={`cite-${match.index}`}
            title={citation ? `${citation.source}${citation.page ? ` - Page ${citation.page}` : ''}` : `Citation ${citationNum}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: '11px',
              fontWeight: '400',
              fontFamily: 'Inter, -apple-system, sans-serif',
              color: 'var(--chakra-colors-gray-600)',
              backgroundColor: 'transparent',
              padding: '0 2px',
              marginLeft: '1px',
              marginRight: '1px',
              cursor: citation ? 'pointer' : 'default',
              transition: 'all 0.15s ease',
              textDecoration: 'none',
              verticalAlign: 'baseline',
              position: 'relative',
              top: '-0.5em',
              opacity: '0.8',
            }}
            onMouseEnter={(e) => {
              if (citation) {
                e.target.style.color = 'var(--chakra-colors-blue-600)';
                e.target.style.opacity = '1';
                e.target.style.textDecoration = 'underline';
              }
            }}
            onMouseLeave={(e) => {
              if (citation) {
                e.target.style.color = 'var(--chakra-colors-gray-600)';
                e.target.style.opacity = '0.8';
                e.target.style.textDecoration = 'none';
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (citation) {
                console.log('=== CITATION CLICKED ===');
                console.log('Full citation object:', citation);
                console.log('Citation ID:', citation.id);
                console.log('Citation source:', citation.source);
                console.log('Citation content:', citation.content);
                console.log('Citation content length:', citation.content?.length);
                console.log('Citation excerpt:', citation.excerpt);
                console.log('Citation type:', citation.type);

                // Open citation modal with this specific citation
                const uploadedFile = uploadedFiles.find(f => f.name === citation.source);
                console.log('Found uploaded file:', uploadedFile?.name);
                console.log('Is PDF:', uploadedFile?.isPDF);
                console.log('Has PDF data:', !!uploadedFile?.pdfData);

                const docToShow = {
                  name: citation.source || 'Unknown Source',
                  page: citation.page || null,
                  type: citation.type || 'document',
                  content: citation.content || citation.excerpt || 'No content available',
                  highlight: citation.highlightText || citation.excerpt || citation.content || '',
                  boundingBoxes: citation.boundingBoxes || null,
                  isPDF: uploadedFile?.isPDF || false,
                  pdfData: uploadedFile?.pdfData || null,
                };

                console.log('Document to show:', docToShow);
                console.log('Final content length:', docToShow.content?.length);

                setSelectedDocument(docToShow);
                setDocumentModalOpen(true);
              } else {
                console.error('Citation not found!');
              }
            }}
          >
            {citationNum}
          </span>
        );
        */

        // Use hover citation component instead
        parts.push(
          <HoverCitation
            key={`cite-${match.index}`}
            citationNum={citationNum}
            citation={citation}
            messages={messages}
          />
        );

        lastIndex = match.index + match[0].length;
      }

      // Add remaining text
      if (lastIndex < content.length) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {content.substring(lastIndex)}
          </span>
        );
      }

      return <div style={{ whiteSpace: 'pre-wrap' }}>{parts}</div>;
    }

    // Default text rendering
    return <Text whiteSpace="pre-wrap">{msg.content}</Text>;
  };

  const sendMessage = async (messageText) => {
    if ((!messageText.trim() && selectedImages.length === 0) || isLoading) return;

    // Build message content with text and images
    let userMessageContent;

    if (selectedImages.length > 0) {
      // Multi-modal message with images
      userMessageContent = [
        ...(messageText.trim() ? [{ type: "text", text: messageText }] : []),
        ...selectedImages.map(img => ({
          type: "image_url",
          image_url: {
            url: img.base64,
          },
        })),
      ];
    } else {
      // Text-only message
      userMessageContent = messageText;
    }

    const userMessage = { role: "user", content: userMessageContent };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setMessage("");
    setSelectedImages([]);
    setIsLoading(true);

    // Save user message to Supabase
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          role: 'user',
          content: typeof userMessageContent === 'string' ? userMessageContent : JSON.stringify(userMessageContent),
          citations: null,
        }),
      });
    } catch (error) {
      console.error('Error saving user message to Supabase:', error);
    }

    // Create new abort controller for this request
    const controller = new AbortController();
    setAbortController(controller);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,  // Add abort signal
        body: JSON.stringify({
          messages: newMessages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          useRAG: uploadedFiles.length > 0, // Only use RAG if documents are uploaded
          sessionId: sessionId,  // Pass session ID to backend
          tutoringMode: tutoringMode,  // Pass tutoring mode for personalized responses
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();

      // Store citations if available - ACCUMULATE, don't replace
      if (data.citations && data.citations.length > 0) {
        // Data integrity validation - log citation sources for debugging
        console.log(`📚 Received ${data.citations.length} citations for session ${sessionId}`);
        data.citations.forEach((citation, idx) => {
          console.log(`  Citation ${idx + 1}: ${citation.source} (type: ${citation.type})`);
        });

        setAllCitations(prevCitations => {
          // Create a map to track existing citations by unique key
          const existingMap = new Map();
          prevCitations.forEach(citation => {
            // Create unique key from source, page, and content snippet
            const contentSnippet = citation.content ? citation.content.substring(0, 100) : '';
            const key = `${citation.source}-${citation.page || 'no-page'}-${contentSnippet}`;
            existingMap.set(key, citation);
          });

          // Add new citations, avoiding duplicates
          const newCitations = [];
          data.citations.forEach(citation => {
            const contentSnippet = citation.content ? citation.content.substring(0, 100) : '';
            const key = `${citation.source}-${citation.page || 'no-page'}-${contentSnippet}`;
            if (!existingMap.has(key)) {
              newCitations.push(citation);
            }
          });

          if (newCitations.length > 0) {
            console.log(`✅ Adding ${newCitations.length} new citations, total will be ${prevCitations.length + newCitations.length}`);
          }

          // Combine and renumber citations sequentially
          const combined = [...prevCitations, ...newCitations];
          return combined.map((citation, index) => ({
            ...citation,
            id: index + 1,
            sessionId: sessionId  // Tag citation with session ID for tracking
          }));
        });
      }

      const assistantMessage = {
        role: "assistant",
        content: data.reply,
        citations: data.citations || null
      };

      setMessages([...newMessages, assistantMessage]);

      // Save assistant message to Supabase
      try {
        await fetch('/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            session_id: sessionId,
            role: 'assistant',
            content: data.reply,
            citations: data.citations || null,
          }),
        });
      } catch (error) {
        console.error('Error saving assistant message to Supabase:', error);
      }
    } catch (error) {
      // Check if request was aborted due to session switch
      if (error.name === 'AbortError') {
        console.log('Request cancelled due to session switch');
        return; // Don't update messages or show error
      }

      console.error("Error sending message:", error);
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setAbortController(null);
      setIsLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Chat - PaperSage</title>
        <meta name="description" content="Chat with PaperSage AI" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Flex h="100vh" overflow="hidden" position="relative" bg="white" _dark={{ bg: "gray.900" }}>
        {/* LEFT PANEL: Sources Sidebar (NotebookLM style) */}
        <Box
          w="280px"
          bg="white"
          _dark={{ bg: "gray.900", borderColor: "gray.800" }}
          borderRightWidth="1px"
          borderColor="gray.100"
          display={{ base: "none", lg: "block" }}
          overflowY="auto"
        >
          <VStack gap={4} align="stretch" p={4}>
            <VStack align="start" gap={1}>
              <Heading size="md" fontWeight="600">
                {sessionName || "PaperSage"}
              </Heading>
              <Text fontSize="xs" color="gray.600" _dark={{ color: "gray.400" }}>
                AI Research Assistant
              </Text>
            </VStack>

            {/* Sources Section - NotebookLM Style */}
            <Box>
              {/* Add Sources Button */}
              <Button
                leftIcon={<FiUpload />}
                colorScheme="blue"
                size="md"
                w="full"
                mb={3}
                borderRadius="xl"
                fontWeight="600"
                transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                _hover={{
                  transform: "translateY(-1px)",
                  shadow: "md",
                }}
                _active={{
                  transform: "translateY(0)",
                }}
                onClick={() => document.getElementById("file-upload-desktop").click()}
              >
                Add sources
              </Button>

              {/* Hidden file input */}
              <input
                id="file-upload-desktop"
                type="file"
                accept=".pdf,.txt,.md,.csv,.json,.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg"
                multiple
                style={{ display: "none" }}
                onChange={handleFileUpload}
              />

              {/* Sources List */}
              {uploadedFiles.length > 0 && (
                <VStack gap={2} align="stretch">
                  <HStack justify="space-between" align="center" mb={1}>
                    <Text fontSize="xs" fontWeight="600" color="gray.600" _dark={{ color: "gray.400" }}>
                      SOURCES ({uploadedFiles.length})
                    </Text>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        if (selectedSources.length === uploadedFiles.length) {
                          setSelectedSources([]);
                        } else {
                          setSelectedSources(uploadedFiles.map((_, idx) => idx));
                        }
                      }}
                      fontSize="xs"
                      color="blue.600"
                      _dark={{ color: "blue.400" }}
                      fontWeight="600"
                      _hover={{ bg: "blue.50", _dark: { bg: "blue.900" } }}
                    >
                      {selectedSources.length === uploadedFiles.length ? "Deselect All" : "Select All"}
                    </Button>
                  </HStack>
                  {uploadedFiles.map((file, idx) => (
                    <Box
                      key={idx}
                      p={3}
                      borderRadius="lg"
                      bg="gray.50"
                      _dark={{ bg: "gray.800" }}
                      border="1px solid"
                      borderColor={selectedSources.includes(idx) ? "blue.500" : "gray.100"}
                      _dark={{ borderColor: selectedSources.includes(idx) ? "blue.400" : "gray.700" }}
                      position="relative"
                      cursor="pointer"
                      transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                      _hover={{
                        borderColor: "blue.400",
                        transform: "translateY(-1px)",
                        shadow: "sm",
                        _dark: { borderColor: "blue.500" }
                      }}
                      onClick={() => {
                        if (selectedSources.includes(idx)) {
                          setSelectedSources(selectedSources.filter(i => i !== idx));
                        } else {
                          setSelectedSources([...selectedSources, idx]);
                        }
                      }}
                    >
                      <HStack gap={2} align="start">
                        {/* Checkbox */}
                        <Box
                          w="18px"
                          h="18px"
                          borderRadius="sm"
                          border="2px solid"
                          borderColor={selectedSources.includes(idx) ? "blue.500" : "gray.300"}
                          _dark={{ borderColor: selectedSources.includes(idx) ? "blue.400" : "gray.500" }}
                          bg={selectedSources.includes(idx) ? "blue.500" : "transparent"}
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          transition="all 0.15s ease"
                          flexShrink={0}
                          mt="2px"
                        >
                          {selectedSources.includes(idx) && (
                            <FiCheck size={12} color="white" />
                          )}
                        </Box>
                        <Box
                          p={2}
                          bg="blue.50"
                          _dark={{ bg: "blue.900" }}
                          borderRadius="md"
                          flexShrink={0}
                        >
                          <FiFile size={16} color="var(--chakra-colors-blue-500)" />
                        </Box>
                        <VStack align="start" gap={0} flex={1} minW={0}>
                          <Text fontSize="xs" fontWeight="600" noOfLines={2}>
                            {file.name}
                          </Text>
                          {file.chunks && (
                            <Text fontSize="xs" color="gray.500" _dark={{ color: "gray.400" }}>
                              {file.chunks} chunks
                            </Text>
                          )}
                        </VStack>
                        <IconButton
                          icon={<FiTrash2 />}
                          size="xs"
                          variant="ghost"
                          colorScheme="red"
                          aria-label="Delete file"
                          position="absolute"
                          top={2}
                          right={2}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFile(idx);
                          }}
                          opacity={0}
                          _groupHover={{ opacity: 1 }}
                        />
                      </HStack>
                    </Box>
                  ))}
                </VStack>
              )}
            </Box>
          </VStack>
        </Box>

        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <>
            {/* Backdrop */}
            <Box
              position="fixed"
              top={0}
              left={0}
              right={0}
              bottom={0}
              bg="blackAlpha.600"
              zIndex={10}
              display={{ base: "block", md: "none" }}
              onClick={() => setIsSidebarOpen(false)}
            />
            {/* Sidebar */}
            <Box
              position="fixed"
              top={0}
              left={0}
              bottom={0}
              w="300px"
              bg="white"
              _dark={{ bg: "gray.800" }}
              zIndex={20}
              p={4}
              overflowY="auto"
              display={{ base: "block", md: "none" }}
            >
              <Flex justify="space-between" align="center" mb={4}>
                <Heading size="lg">PaperSage</Heading>
                <IconButton
                  icon={<FiX />}
                  variant="ghost"
                  onClick={() => setIsSidebarOpen(false)}
                  aria-label="Close menu"
                />
              </Flex>
              <VStack gap={4} align="stretch">
                {/* Session Name */}
                <Heading size="md">{sessionName || "Chat Session"}</Heading>

                {/* Back to Sessions */}
                <Button
                  leftIcon={<FiArrowLeft />}
                  variant="ghost"
                  onClick={() => router.push("/sessions")}
                  justifyContent="flex-start"
                >
                  Back to Sessions
                </Button>

                {/* Uploaded Files */}
                <Box>
                  <Text fontSize="sm" fontWeight="bold" color="gray.600" _dark={{ color: "gray.400" }} mb={3}>
                    Uploaded Files
                  </Text>
                  {uploadedFiles.length === 0 ? (
                    <Text fontSize="sm" color="gray.500" _dark={{ color: "gray.500" }}>
                      No files uploaded yet
                    </Text>
                  ) : (
                    <VStack gap={2} align="stretch">
                      {uploadedFiles.map((file, index) => (
                        <HStack key={index} gap={2} p={2} borderRadius="md" bg="gray.50" _dark={{ bg: "gray.700" }}>
                          <FiFile size={16} />
                          <VStack align="start" gap={0} flex={1}>
                            <Text fontSize="sm" noOfLines={1}>
                              {file.name}
                            </Text>
                            {file.chunks && (
                              <Text fontSize="xs" color="gray.500">
                                {file.chunks} chunks
                              </Text>
                            )}
                          </VStack>
                        </HStack>
                      ))}
                    </VStack>
                  )}
                </Box>
              </VStack>
            </Box>
          </>
        )}

        {/* CENTER PANEL: Main Chat Area */}
        <Flex flex={1} direction="column" overflow="hidden" maxW={{ lg: "calc(100vw - 560px)" }}>
          {/* Header */}
          <Flex
            px={6}
            py={4}
            borderBottomWidth="1px"
            borderColor="gray.200"
            _dark={{ borderColor: "gray.700" }}
            align="center"
            gap={4}
          >
            <IconButton
              icon={<FiArrowLeft />}
              variant="ghost"
              onClick={() => router.push("/sessions")}
              aria-label="Back to sessions"
            />
            <VStack gap={0} align="start">
              <Text fontWeight="bold" fontSize="md">
                {sessionName || "Chat Session"}
              </Text>
              <Text fontSize="xs" color="gray.500" _dark={{ color: "gray.400" }}>
                AI Research Assistant
              </Text>
            </VStack>
            {uploadedFiles.length > 0 && (
              <HStack gap={2}>
                <FiFile />
                <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }}>
                  {uploadedFiles.length} document{uploadedFiles.length > 1 ? "s" : ""}
                </Text>
              </HStack>
            )}
            <Spacer />

            {showUrlInput ? (
              <HStack gap={2}>
                <input
                  type="text"
                  placeholder="Enter paper URL (arXiv, PubMed, etc.)"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleUrlSubmit();
                    }
                  }}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid #CBD5E0",
                    minWidth: "300px",
                    fontSize: "14px",
                  }}
                />
                <Button
                  size="sm"
                  colorScheme="blue"
                  onClick={handleUrlSubmit}
                  isLoading={isUploading}
                >
                  Scrape
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowUrlInput(false);
                    setUrlInput("");
                  }}
                >
                  Cancel
                </Button>
              </HStack>
            ) : (
              <>
                <Button
                  leftIcon={<FiLink />}
                  size="sm"
                  variant="outline"
                  onClick={() => setShowUrlInput(true)}
                >
                  Add URL
                </Button>
                <Button
                  leftIcon={<FiUpload />}
                  size="sm"
                  variant="outline"
                  as="label"
                  htmlFor="file-upload"
                  isLoading={isUploading}
                  cursor="pointer"
                >
                  Upload File
                </Button>
              </>
            )}

            <input
              id="file-upload"
              type="file"
              accept=".pdf,.txt,.md,.csv,.json,.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg"
              multiple
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />
            <IconButton
              icon={colorMode === "light" ? <FiMoon /> : <FiSun />}
              variant="ghost"
              onClick={toggleColorMode}
              aria-label="Toggle color mode"
            />
          </Flex>

          {/* Messages Area */}
          <Box flex={1} overflowY="auto" p={6}>
            <Container maxW="container.lg">
              {messages.length === 0 ? (
                <VStack gap={8} align="center" py={10}>
                  {uploadedFiles.length === 0 ? (
                    // Document upload interface
                    <>
                      <VStack gap={4} align="center">
                        <Heading size="2xl" textAlign="center">
                          Welcome to PaperSage
                        </Heading>
                        <Text fontSize="lg" color="gray.600" _dark={{ color: "gray.400" }} textAlign="center">
                          Upload documents or add URLs to start your research assistant
                        </Text>
                      </VStack>

                      <VStack gap={6} w="full" maxW="600px">
                        {/* File Upload Card */}
                        <Card.Root w="full" variant="outline">
                          <Card.Body>
                            <VStack gap={4}>
                              <Box
                                as="label"
                                htmlFor="initial-file-upload"
                                cursor="pointer"
                                w="full"
                                p={8}
                                border="2px dashed"
                                borderColor={isUploading ? "blue.400" : "gray.300"}
                                _dark={{ borderColor: isUploading ? "blue.400" : "gray.600" }}
                                borderRadius="lg"
                                textAlign="center"
                                transition="all 0.2s"
                                _hover={{
                                  borderColor: "blue.400",
                                  bg: "blue.50",
                                  _dark: { bg: "blue.900" }
                                }}
                                opacity={isUploading ? 0.7 : 1}
                              >
                                <VStack gap={3}>
                                  <Box fontSize="3xl" color="blue.500">
                                    {isUploading ? <Spinner size="lg" color="blue.500" /> : <FiUpload />}
                                  </Box>
                                  <Text fontWeight="semibold">
                                    {isUploading ? "Uploading..." : "Drop files here or click to browse"}
                                  </Text>
                                  <Text fontSize="sm" color="gray.500">
                                    {isUploading
                                      ? "Processing document with GPT-4 Vision..."
                                      : "Supports PDF, TXT, MD, CSV, JSON, and image files (JPG, PNG, etc.)"}
                                  </Text>
                                </VStack>
                              </Box>
                              <input
                                id="initial-file-upload"
                                type="file"
                                accept=".pdf,.txt,.md,.csv,.json,.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg"
                                onChange={handleFileUpload}
                                multiple
                                style={{ display: "none" }}
                                disabled={isUploading}
                              />
                            </VStack>
                          </Card.Body>
                        </Card.Root>

                        {/* URL Input Card */}
                        <Card.Root w="full" variant="outline">
                          <Card.Body>
                            <VStack gap={4} align="stretch">
                              <HStack gap={3}>
                                <Box fontSize="xl" color="blue.500">
                                  <FiLink />
                                </Box>
                                <Text fontWeight="semibold">Add from URL</Text>
                              </HStack>
                              <HStack gap={2}>
                                <input
                                  type="text"
                                  placeholder="Paste arXiv, PubMed, or paper URL..."
                                  value={urlInput}
                                  onChange={(e) => setUrlInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !isUploading) {
                                      handleUrlSubmit();
                                    }
                                  }}
                                  style={{
                                    flex: 1,
                                    padding: "8px 12px",
                                    borderRadius: "6px",
                                    border: "1px solid #CBD5E0",
                                    fontSize: "14px",
                                  }}
                                  disabled={isUploading}
                                />
                                <Button
                                  colorScheme="blue"
                                  onClick={handleUrlSubmit}
                                  isLoading={isUploading}
                                  disabled={!urlInput.trim() || isUploading}
                                >
                                  Add
                                </Button>
                              </HStack>
                              <Text fontSize="xs" color="gray.500">
                                Works with arXiv, PubMed, Google Scholar, and most academic sites
                              </Text>
                            </VStack>
                          </Card.Body>
                        </Card.Root>

                        {/* Quick Start */}
                        <Box textAlign="center" w="full">
                          <Text fontSize="sm" color="gray.500" mb={2}>
                            Or start without documents
                          </Text>
                          <Button
                            variant="ghost"
                            onClick={() => setMessages([{ role: "system", content: "Chat started without documents" }])}
                          >
                            Skip and start chatting →
                          </Button>
                        </Box>
                      </VStack>
                    </>
                  ) : (
                    // Original interface when documents are uploaded
                    <>
                      <Heading size="2xl" textAlign="center">
                        How can I help you with your research?
                      </Heading>
                      <Box w="full" p={4} bg="green.50" _dark={{ bg: "green.900", opacity: 0.3 }} borderRadius="md">
                        <HStack justify="center" gap={2}>
                          <Text color="green.700" _dark={{ color: "green.300" }}>
                            ✓ {uploadedFiles.length} document{uploadedFiles.length > 1 ? "s" : ""} loaded
                          </Text>
                        </HStack>
                      </Box>
                      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4} w="full" mt={4}>
                        {suggestedPrompts.map((prompt, index) => (
                          <Card.Root
                            key={index}
                            variant="outline"
                            cursor="pointer"
                            _hover={{
                              borderColor: "blue.500",
                              transform: "translateY(-2px)",
                              shadow: "md",
                            }}
                            transition="all 0.2s"
                            onClick={() => sendMessage(prompt.description)}
                          >
                            <Card.Body>
                              <VStack align="start" gap={2}>
                                <Text fontWeight="bold" fontSize="sm">
                                  {prompt.title}
                                </Text>
                                <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }}>
                                  {prompt.description}
                                </Text>
                              </VStack>
                            </Card.Body>
                          </Card.Root>
                        ))}
                      </SimpleGrid>
                    </>
                  )}
                </VStack>
              ) : (
                <VStack gap={6} align="stretch" py={4}>
                  {messages.map((msg, index) => (
                    <Box
                      key={index}
                      alignSelf={
                        msg.role === "system"
                          ? "center"
                          : msg.role === "user"
                          ? "flex-end"
                          : "flex-start"
                      }
                      maxW={msg.role === "system" ? "100%" : "85%"}
                    >
                      {msg.role === "system" ? (
                        <Box color="gray.500" _dark={{ color: "gray.400" }} fontSize="sm" fontStyle="italic">
                          {renderMessageContent(msg)}
                        </Box>
                      ) : (
                        <Box
                          bg={
                            msg.role === "user"
                              ? "blue.500"
                              : "gray.700"
                          }
                          _dark={{
                            bg: msg.role === "user" ? "blue.600" : "gray.700"
                          }}
                          px={5}
                          py={4}
                          borderRadius="2xl"
                          shadow="sm"
                        >
                          <Box color="white">
                            {renderMessageContent(msg)}
                          </Box>
                        </Box>
                      )}
                    </Box>
                  ))}
                  {isLoading && (
                    <Box alignSelf="flex-start" maxW="85%">
                      <Text color="gray.500" _dark={{ color: "gray.400" }} fontStyle="italic">
                        Thinking...
                      </Text>
                    </Box>
                  )}
                </VStack>
              )}
            </Container>
          </Box>

          {/* Input Area */}
          <Box
            px={6}
            py={4}
            borderTopWidth="1px"
            borderColor="gray.200"
            _dark={{ borderColor: "gray.700", bg: "gray.900" }}
            bg="white"
          >
            <Container maxW="container.lg">
              <VStack gap={3} align="stretch">
                {/* Image Previews */}
                {selectedImages.length > 0 && (
                  <HStack gap={2} flexWrap="wrap">
                    {selectedImages.map((img, idx) => (
                      <Box
                        key={idx}
                        position="relative"
                        borderRadius="md"
                        overflow="hidden"
                      >
                        <Box
                          as="img"
                          src={img.url}
                          alt={img.fileName}
                          h="80px"
                          w="auto"
                          borderRadius="md"
                        />
                        <IconButton
                          icon={<FiX />}
                          size="xs"
                          position="absolute"
                          top={1}
                          right={1}
                          colorScheme="red"
                          onClick={() => removeImage(idx)}
                          aria-label="Remove image"
                        />
                      </Box>
                    ))}
                  </HStack>
                )}

                {/* Tutoring Mode Selector */}
                <HStack gap={2} mb={2}>
                  <Text fontSize="xs" fontWeight="600" color="gray.600" _dark={{ color: "gray.400" }}>
                    Mode:
                  </Text>
                  <HStack gap={2}>
                    <Button
                      size="xs"
                      variant={tutoringMode === "direct" ? "solid" : "outline"}
                      colorScheme={tutoringMode === "direct" ? "blue" : "gray"}
                      onClick={() => setTutoringMode("direct")}
                      borderRadius="full"
                      px={3}
                      _hover={{ transform: "translateY(-1px)" }}
                      transition="all 0.2s"
                    >
                      ⚡ Direct
                    </Button>
                    <Button
                      size="xs"
                      variant={tutoringMode === "interactive" ? "solid" : "outline"}
                      colorScheme={tutoringMode === "interactive" ? "purple" : "gray"}
                      onClick={() => setTutoringMode("interactive")}
                      borderRadius="full"
                      px={3}
                      _hover={{ transform: "translateY(-1px)" }}
                      transition="all 0.2s"
                    >
                      📚 Interactive
                    </Button>
                  </HStack>
                  <Text fontSize="xs" color="gray.500" _dark={{ color: "gray.500" }} fontStyle="italic">
                    {tutoringMode === "direct" ? "Get straight answers" : "Learn through Socratic questioning"}
                  </Text>
                </HStack>

                {/* Input Area */}
                <HStack gap={3}>
                  <IconButton
                    as="label"
                    icon={<FiImage />}
                    variant="ghost"
                    aria-label="Upload image"
                    cursor="pointer"
                    isLoading={isUploadingImage}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      style={{ display: "none" }}
                    />
                  </IconButton>
                  <Textarea
                    placeholder="Ask me anything about your research..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    resize="none"
                    rows={1}
                    minH="unset"
                    overflow="hidden"
                    borderRadius="xl"
                    borderColor="gray.200"
                    _dark={{ borderColor: "gray.700" }}
                    _focus={{
                      borderColor: "blue.500",
                      shadow: "0 0 0 1px var(--chakra-colors-blue-500)",
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage(message);
                      }
                    }}
                  />
                  <IconButton
                    icon={<FiSend />}
                    colorScheme="blue"
                    aria-label="Send message"
                    borderRadius="xl"
                    transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                    _hover={{
                      transform: "translateY(-1px)",
                      shadow: "md",
                    }}
                    _active={{
                      transform: "translateY(0)",
                    }}
                    onClick={() => sendMessage(message)}
                    disabled={(!message.trim() && selectedImages.length === 0) || isLoading}
                  />
                </HStack>

                {/* Suggested Questions - NotebookLM Style */}
                {uploadedFiles.length > 0 && messages.length === 0 && (
                  <VStack gap={2} align="stretch" mt={2}>
                    <Text fontSize="xs" color="gray.600" _dark={{ color: "gray.400" }} fontWeight="600">
                      Suggested questions:
                    </Text>
                    <HStack gap={2} flexWrap="wrap">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => sendMessage("What are the main findings?")}
                        borderRadius="full"
                        px={3}
                        _hover={{ bg: "blue.50", borderColor: "blue.400", _dark: { bg: "blue.900" } }}
                      >
                        What are the main findings?
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => sendMessage("Summarize the key points")}
                        borderRadius="full"
                        px={3}
                        _hover={{ bg: "blue.50", borderColor: "blue.400", _dark: { bg: "blue.900" } }}
                      >
                        Summarize the key points
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => sendMessage("What methodology was used?")}
                        borderRadius="full"
                        px={3}
                        _hover={{ bg: "blue.50", borderColor: "blue.400", _dark: { bg: "blue.900" } }}
                      >
                        What methodology was used?
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => sendMessage("What are the conclusions?")}
                        borderRadius="full"
                        px={3}
                        _hover={{ bg: "blue.50", borderColor: "blue.400", _dark: { bg: "blue.900" } }}
                      >
                        What are the conclusions?
                      </Button>
                    </HStack>
                  </VStack>
                )}

                {/* Context-aware suggested questions after conversation starts */}
                {uploadedFiles.length > 0 && messages.length > 0 && !isLoading && (
                  <HStack gap={2} flexWrap="wrap" mt={1}>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => sendMessage("Tell me more")}
                      borderRadius="full"
                      px={3}
                      fontSize="xs"
                      color="gray.600"
                      _dark={{ color: "gray.400" }}
                      _hover={{ bg: "blue.50", color: "blue.600", _dark: { bg: "blue.900", color: "blue.300" } }}
                    >
                      Tell me more
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => sendMessage("Can you explain that differently?")}
                      borderRadius="full"
                      px={3}
                      fontSize="xs"
                      color="gray.600"
                      _dark={{ color: "gray.400" }}
                      _hover={{ bg: "blue.50", color: "blue.600", _dark: { bg: "blue.900", color: "blue.300" } }}
                    >
                      Explain differently
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => sendMessage("What are the implications?")}
                      borderRadius="full"
                      px={3}
                      fontSize="xs"
                      color="gray.600"
                      _dark={{ color: "gray.400" }}
                      _hover={{ bg: "blue.50", color: "blue.600", _dark: { bg: "blue.900", color: "blue.300" } }}
                    >
                      What are the implications?
                    </Button>
                  </HStack>
                )}
              </VStack>
            </Container>
          </Box>
        </Flex>

        {/* RIGHT PANEL: Studio (NotebookLM style) */}
        <Box
          w="280px"
          bg="white"
          _dark={{ bg: "gray.900", borderColor: "gray.800" }}
          borderLeftWidth="1px"
          borderColor="gray.100"
          display={{ base: "none", lg: "block" }}
          overflowY="auto"
        >
          <VStack gap={4} align="stretch" p={4}>
            <Heading size="md" fontWeight="600">
              Studio
            </Heading>

            <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }}>
              Generate study materials from your sources
            </Text>

            {/* Studio Actions - NotebookLM style */}
            <VStack gap={2} align="stretch" mt={2}>
              {/* Flashcards */}
              <Button
                variant="outline"
                justifyContent="flex-start"
                h="auto"
                py={4}
                px={4}
                borderRadius="xl"
                borderColor="gray.100"
                _dark={{ borderColor: "gray.800", bg: "gray.900" }}
                bg="gray.50"
                transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                _hover={{
                  bg: "blue.50",
                  borderColor: "blue.500",
                  transform: "translateY(-2px)",
                  shadow: "md",
                  _dark: { bg: "blue.900", borderColor: "blue.400" },
                }}
                _active={{
                  transform: "translateY(0)",
                }}
                isDisabled={uploadedFiles.length === 0}
                onClick={() => generateStudioContent('flashcards')}
                isLoading={isGeneratingStudio && studioType === 'flashcards'}
              >
                <VStack align="start" gap={1} w="full">
                  <HStack gap={2}>
                    <Text fontSize="2xl">📇</Text>
                    <Text fontWeight="600" fontSize="sm">
                      Flashcards
                    </Text>
                  </HStack>
                  <Text fontSize="xs" color="gray.500" _dark={{ color: "gray.400" }}>
                    Create study flashcards
                  </Text>
                </VStack>
              </Button>

              {/* Quiz */}
              <Button
                variant="outline"
                justifyContent="flex-start"
                h="auto"
                py={4}
                px={4}
                borderRadius="xl"
                borderColor="gray.100"
                _dark={{ borderColor: "gray.800", bg: "gray.900" }}
                bg="gray.50"
                transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                _hover={{
                  bg: "blue.50",
                  borderColor: "blue.500",
                  transform: "translateY(-2px)",
                  shadow: "md",
                  _dark: { bg: "blue.900", borderColor: "blue.400" },
                }}
                _active={{
                  transform: "translateY(0)",
                }}
                isDisabled={uploadedFiles.length === 0}
                onClick={() => generateStudioContent('quiz')}
                isLoading={isGeneratingStudio && studioType === 'quiz'}
              >
                <VStack align="start" gap={1} w="full">
                  <HStack gap={2}>
                    <Text fontSize="2xl">✅</Text>
                    <Text fontWeight="600" fontSize="sm">
                      Quiz
                    </Text>
                  </HStack>
                  <Text fontSize="xs" color="gray.500" _dark={{ color: "gray.400" }}>
                    Test your understanding
                  </Text>
                </VStack>
              </Button>
            </VStack>

            {/* Help Text */}
            {uploadedFiles.length === 0 && (
              <Box
                p={3}
                bg="blue.50"
                _dark={{ bg: "blue.900", opacity: 0.3 }}
                borderRadius="md"
                mt={2}
              >
                <Text fontSize="xs" color="blue.700" _dark={{ color: "blue.300" }}>
                  💡 Add sources to unlock Studio features
                </Text>
              </Box>
            )}
          </VStack>
        </Box>
      </Flex>

      {/* Audio Overview Modal */}
      {audioOverviewOpen && audioOverview && (
        <>
          <Box
            position="fixed"
            top={0}
            left={0}
            right={0}
            bottom={0}
            bg="blackAlpha.700"
            backdropFilter="blur(8px)"
            zIndex={1000}
            onClick={() => setAudioOverviewOpen(false)}
          />

          <Box
            position="fixed"
            top="50%"
            left="50%"
            transform="translate(-50%, -50%)"
            bg="white"
            _dark={{ bg: "gray.900" }}
            borderRadius="2xl"
            boxShadow="0 25px 50px -12px rgba(0, 0, 0, 0.25)"
            zIndex={1001}
            maxW="900px"
            w="92%"
            maxH="85vh"
            overflow="hidden"
            border="1px solid"
            borderColor="gray.100"
            _dark={{ borderColor: "gray.800" }}
          >
            {/* Header */}
            <Flex
              px={6}
              py={4}
              align="center"
              justify="space-between"
              borderBottom="1px solid"
              borderColor="gray.100"
              _dark={{ borderColor: "gray.800" }}
              bg="gradient-to-r from-blue-50 to-purple-50"
              _dark={{ bg: "gray.900" }}
            >
              <HStack gap={3}>
                <Text fontSize="3xl">🎙️</Text>
                <VStack align="start" gap={0}>
                  <Text fontSize="lg" fontWeight="700" color="gray.800" _dark={{ color: "gray.100" }}>
                    Audio Overview
                  </Text>
                  <Text fontSize="xs" color="gray.600" _dark={{ color: "gray.400" }}>
                    Podcast-style discussion of your sources
                  </Text>
                </VStack>
              </HStack>
              <IconButton
                icon={<FiX />}
                variant="ghost"
                size="sm"
                onClick={() => setAudioOverviewOpen(false)}
                aria-label="Close"
                borderRadius="full"
              />
            </Flex>

            {/* Content */}
            <Box
              p={8}
              overflowY="auto"
              maxH="calc(85vh - 80px)"
              css={{
                '&::-webkit-scrollbar': { width: '6px' },
                '&::-webkit-scrollbar-track': { background: 'transparent' },
                '&::-webkit-scrollbar-thumb': { background: '#CBD5E0', borderRadius: '10px' },
              }}
            >
              <VStack gap={6} align="stretch">
                {/* Dialogue */}
                <Box>
                  {audioOverview.dialogue.split('\n').map((line, idx) => {
                    const isAlex = line.startsWith('**Alex:**');
                    const isJamie = line.startsWith('**Jamie:**');

                    if (!isAlex && !isJamie) return null;

                    const speaker = isAlex ? 'Alex' : 'Jamie';
                    const text = line.replace(/\*\*(Alex|Jamie):\*\*/, '').trim();

                    return (
                      <Box
                        key={idx}
                        mb={4}
                        p={4}
                        bg={isAlex ? "blue.50" : "purple.50"}
                        _dark={{ bg: isAlex ? "blue.900" : "purple.900", opacity: 0.4 }}
                        borderRadius="lg"
                        borderLeft="4px solid"
                        borderColor={isAlex ? "blue.400" : "purple.400"}
                      >
                        <Text fontWeight="700" fontSize="sm" color={isAlex ? "blue.600" : "purple.600"} _dark={{ color: isAlex ? "blue.300" : "purple.300" }} mb={2}>
                          {speaker}
                        </Text>
                        <Text fontSize="md" lineHeight="1.7" color="gray.800" _dark={{ color: "gray.200" }}>
                          {text}
                        </Text>
                      </Box>
                    );
                  })}
                </Box>

                {/* Sources Used */}
                <Box
                  p={4}
                  bg="gray.50"
                  _dark={{ bg: "gray.800" }}
                  borderRadius="lg"
                  borderTop="2px solid"
                  borderColor="gray.200"
                  _dark={{ borderColor: "gray.700" }}
                >
                  <Text fontSize="xs" fontWeight="700" color="gray.600" _dark={{ color: "gray.400" }} mb={2}>
                    Sources Used:
                  </Text>
                  <VStack align="start" gap={1}>
                    {[...new Set(audioOverview.sources)].map((source, idx) => (
                      <Text key={idx} fontSize="xs" color="gray.700" _dark={{ color: "gray.300" }}>
                        • {source}
                      </Text>
                    ))}
                  </VStack>
                </Box>
              </VStack>
            </Box>
          </Box>
        </>
      )}

      {/* Universal Studio Modal - for Mind Map, Flashcards, Quiz, Reports */}
      {studioModalOpen && studioContent && (
        <>
          <Box
            position="fixed"
            top={0}
            left={0}
            right={0}
            bottom={0}
            bg="blackAlpha.700"
            backdropFilter="blur(8px)"
            zIndex={1000}
            onClick={() => setStudioModalOpen(false)}
          />

          <Box
            position="fixed"
            top="50%"
            left="50%"
            transform="translate(-50%, -50%)"
            bg="white"
            _dark={{ bg: "gray.900" }}
            borderRadius="2xl"
            boxShadow="0 25px 50px -12px rgba(0, 0, 0, 0.25)"
            zIndex={1001}
            maxW="900px"
            w="92%"
            maxH="85vh"
            overflow="hidden"
            border="1px solid"
            borderColor="gray.100"
            _dark={{ borderColor: "gray.800" }}
          >
            {/* Header */}
            <Flex
              px={6}
              py={4}
              align="center"
              justify="space-between"
              borderBottom="1px solid"
              borderColor="gray.100"
              _dark={{ borderColor: "gray.800" }}
              bg="gradient-to-r from-purple-50 to-pink-50"
              _dark={{ bg: "gray.900" }}
            >
              <HStack gap={3}>
                <Text fontSize="3xl">
                  {studioType === 'mindmap' && '🧠'}
                  {studioType === 'flashcards' && '📇'}
                  {studioType === 'quiz' && '✅'}
                  {studioType === 'report' && '📊'}
                </Text>
                <VStack align="start" gap={0}>
                  <Text fontSize="lg" fontWeight="700" color="gray.800" _dark={{ color: "gray.100" }}>
                    {studioType === 'mindmap' && 'Mind Map'}
                    {studioType === 'flashcards' && 'Flashcards'}
                    {studioType === 'quiz' && 'Quiz'}
                    {studioType === 'report' && 'Analysis Report'}
                  </Text>
                  <Text fontSize="xs" color="gray.600" _dark={{ color: "gray.400" }}>
                    {studioType === 'mindmap' && 'Visual concept map'}
                    {studioType === 'flashcards' && `${studioContent.flashcards?.length || 0} cards`}
                    {studioType === 'quiz' && `${studioContent.questions?.length || 0} questions`}
                    {studioType === 'report' && 'Comprehensive analysis'}
                  </Text>
                </VStack>
              </HStack>
              <IconButton
                icon={<FiX />}
                variant="ghost"
                size="sm"
                onClick={() => setStudioModalOpen(false)}
                aria-label="Close"
                borderRadius="full"
              />
            </Flex>

            {/* Content */}
            <Box
              p={studioType === 'flashcards' ? 6 : 8}
              overflowY="auto"
              maxH="calc(85vh - 80px)"
              css={{
                '&::-webkit-scrollbar': { width: '6px' },
                '&::-webkit-scrollbar-track': { background: 'transparent' },
                '&::-webkit-scrollbar-thumb': { background: '#CBD5E0', borderRadius: '10px' },
              }}
            >
              {/* Mind Map Content */}
              {studioType === 'mindmap' && (
                <Box>
                  <Text fontSize="md" whiteSpace="pre-wrap" lineHeight="1.8">
                    {studioContent.mindmap}
                  </Text>
                </Box>
              )}

              {/* Flashcards Content */}
              {studioType === 'flashcards' && studioContent.flashcards && (
                <VStack gap={6} align="stretch">
                  <HStack justify="space-between">
                    <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }}>
                      Card {currentFlashcardIndex + 1} of {studioContent.flashcards.length}
                    </Text>
                    <HStack gap={2}>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => {
                          setCurrentFlashcardIndex(Math.max(0, currentFlashcardIndex - 1));
                          setShowFlashcardAnswer(false);
                        }}
                        isDisabled={currentFlashcardIndex === 0}
                      >
                        ← Previous
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => {
                          setCurrentFlashcardIndex(Math.min(studioContent.flashcards.length - 1, currentFlashcardIndex + 1));
                          setShowFlashcardAnswer(false);
                        }}
                        isDisabled={currentFlashcardIndex === studioContent.flashcards.length - 1}
                      >
                        Next →
                      </Button>
                    </HStack>
                  </HStack>

                  <Box
                    p={8}
                    bg="gradient-to-br from-blue-50 to-purple-50"
                    _dark={{ bg: "gray.800" }}
                    borderRadius="xl"
                    minH="300px"
                    display="flex"
                    flexDirection="column"
                    justifyContent="center"
                    alignItems="center"
                    cursor="pointer"
                    onClick={() => setShowFlashcardAnswer(!showFlashcardAnswer)}
                    transition="all 0.3s ease"
                    _hover={{ transform: "scale(1.02)" }}
                  >
                    <VStack gap={6}>
                      <Text fontSize="xs" fontWeight="700" color="purple.600" _dark={{ color: "purple.300" }} letterSpacing="wider">
                        {showFlashcardAnswer ? 'ANSWER' : 'QUESTION'}
                      </Text>
                      <Text fontSize="xl" fontWeight="600" textAlign="center" lineHeight="1.6">
                        {showFlashcardAnswer
                          ? studioContent.flashcards[currentFlashcardIndex].answer
                          : studioContent.flashcards[currentFlashcardIndex].question}
                      </Text>
                      <Text fontSize="xs" color="gray.500" _dark={{ color: "gray.400" }}>
                        {showFlashcardAnswer ? 'Click to see question' : 'Click to reveal answer'}
                      </Text>
                    </VStack>
                  </Box>
                </VStack>
              )}

              {/* Quiz Content */}
              {studioType === 'quiz' && studioContent.questions && (
                <VStack gap={6} align="stretch">
                  {studioContent.questions.map((q, qIdx) => (
                    <Box
                      key={qIdx}
                      p={5}
                      bg="gray.50"
                      _dark={{ bg: "gray.800" }}
                      borderRadius="lg"
                      border="1px solid"
                      borderColor="gray.200"
                      _dark={{ borderColor: "gray.700" }}
                    >
                      <Text fontWeight="700" fontSize="md" mb={4}>
                        {qIdx + 1}. {q.question}
                      </Text>
                      <VStack gap={2} align="stretch">
                        {q.options.map((option, oIdx) => {
                          const optionLetter = option.charAt(0);
                          const isSelected = quizAnswers[qIdx] === optionLetter;
                          const isCorrect = q.correct === optionLetter;
                          const showResult = showQuizResults;

                          return (
                            <Box
                              key={oIdx}
                              p={3}
                              borderRadius="md"
                              bg={
                                showResult && isCorrect
                                  ? "green.100"
                                  : showResult && isSelected && !isCorrect
                                  ? "red.100"
                                  : isSelected
                                  ? "blue.100"
                                  : "white"
                              }
                              _dark={{
                                bg: showResult && isCorrect
                                  ? "green.900"
                                  : showResult && isSelected && !isCorrect
                                  ? "red.900"
                                  : isSelected
                                  ? "blue.900"
                                  : "gray.700",
                                opacity: 0.8
                              }}
                              border="2px solid"
                              borderColor={
                                showResult && isCorrect
                                  ? "green.500"
                                  : showResult && isSelected && !isCorrect
                                  ? "red.500"
                                  : isSelected
                                  ? "blue.500"
                                  : "gray.300"
                              }
                              _dark={{
                                borderColor: showResult && isCorrect
                                  ? "green.500"
                                  : showResult && isSelected && !isCorrect
                                  ? "red.500"
                                  : isSelected
                                  ? "blue.500"
                                  : "gray.600"
                              }}
                              cursor={showResult ? "default" : "pointer"}
                              onClick={() => {
                                if (!showResult) {
                                  setQuizAnswers({ ...quizAnswers, [qIdx]: optionLetter });
                                }
                              }}
                              transition="all 0.15s ease"
                              _hover={showResult ? {} : { borderColor: "blue.400" }}
                            >
                              <Text fontSize="sm">
                                {option}
                              </Text>
                            </Box>
                          );
                        })}
                      </VStack>
                      {showQuizResults && q.explanation && (
                        <Box mt={4} p={3} bg="blue.50" _dark={{ bg: "blue.900", opacity: 0.4 }} borderRadius="md">
                          <Text fontSize="sm" fontWeight="600" color="blue.700" _dark={{ color: "blue.300" }} mb={1}>
                            Explanation:
                          </Text>
                          <Text fontSize="sm" color="gray.700" _dark={{ color: "gray.300" }}>
                            {q.explanation}
                          </Text>
                        </Box>
                      )}
                    </Box>
                  ))}

                  {!showQuizResults && (
                    <Button
                      colorScheme="blue"
                      size="lg"
                      onClick={() => setShowQuizResults(true)}
                      isDisabled={Object.keys(quizAnswers).length < studioContent.questions.length}
                    >
                      {Object.keys(quizAnswers).length < studioContent.questions.length
                        ? `Answer ${studioContent.questions.length - Object.keys(quizAnswers).length} more questions`
                        : 'Submit Quiz'}
                    </Button>
                  )}

                  {showQuizResults && (
                    <Box p={5} bg="gradient-to-r from-green-50 to-blue-50" _dark={{ bg: "gray.800" }} borderRadius="lg" textAlign="center">
                      <Text fontSize="2xl" fontWeight="700" mb={2}>
                        Score: {Object.values(quizAnswers).filter((answer, idx) => answer === studioContent.questions[idx].correct).length} / {studioContent.questions.length}
                      </Text>
                      <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }}>
                        {Math.round((Object.values(quizAnswers).filter((answer, idx) => answer === studioContent.questions[idx].correct).length / studioContent.questions.length) * 100)}% correct
                      </Text>
                    </Box>
                  )}
                </VStack>
              )}

              {/* Report Content */}
              {studioType === 'report' && (
                <Box>
                  <Text fontSize="md" whiteSpace="pre-wrap" lineHeight="1.8">
                    {studioContent.report}
                  </Text>
                </Box>
              )}
            </Box>
          </Box>
        </>
      )}

      {/* NotebookLM-style Citation Slide Panel */}
      <Box
        key={selectedDocument ? `${selectedDocument.name}-${selectedDocument.page}-${selectedDocument.highlight?.substring(0, 20)}` : 'empty'}
        position="fixed"
        top={0}
        right={documentModalOpen && selectedDocument ? 0 : "-420px"}
        h="100vh"
        w="400px"
        bg="white"
        _dark={{ bg: "gray.900" }}
        boxShadow="-4px 0 20px rgba(0, 0, 0, 0.15)"
        zIndex={1001}
        transition="right 0.3s ease-in-out"
        borderLeft="1px solid"
        borderColor="gray.200"
        _dark={{ borderColor: "gray.700" }}
        display="flex"
        flexDirection="column"
      >
        {selectedDocument && (
          <>
            {/* Header */}
            <Flex
              px={4}
              py={3}
              align="center"
              justify="space-between"
              borderBottom="1px solid"
              borderColor="gray.200"
              _dark={{ borderColor: "gray.700" }}
              bg="gray.50"
              _dark={{ bg: "gray.800" }}
            >
              <HStack gap={2}>
                <Box w="3px" h="20px" bg="blue.500" borderRadius="full" />
                <VStack align="start" gap={0}>
                  <Text fontSize="sm" fontWeight="600" color="gray.800" _dark={{ color: "white" }} noOfLines={1}>
                    {selectedDocument.name}
                  </Text>
                  {selectedDocument.page && (
                    <Text fontSize="xs" color="gray.500">Page {selectedDocument.page}</Text>
                  )}
                </VStack>
              </HStack>
              <IconButton
                icon={<FiX />}
                size="sm"
                variant="ghost"
                onClick={() => setDocumentModalOpen(false)}
                aria-label="Close panel"
              />
            </Flex>

            {/* Content */}
            <Box flex={1} overflowY="auto" p={4}>
              {/* Clean Quote Card Style */}
              {selectedDocument.highlight && (
                <Box mb={6}>
                  <Box
                    bg="white"
                    _dark={{ bg: "gray.800" }}
                    border="1px solid"
                    borderColor="gray.200"
                    _dark={{ borderColor: "gray.700" }}
                    borderRadius="lg"
                    overflow="hidden"
                    boxShadow="sm"
                  >
                    {/* Source Header */}
                    <HStack
                      px={4}
                      py={2}
                      bg="gray.50"
                      _dark={{ bg: "gray.900" }}
                      borderBottom="1px solid"
                      borderColor="gray.200"
                      _dark={{ borderColor: "gray.700" }}
                    >
                      <FiFile size="12px" color="gray" />
                      <Text fontSize="xs" color="gray.600" _dark={{ color: "gray.400" }}>
                        {selectedDocument.name}
                        {selectedDocument.page && ` • Page ${selectedDocument.page}`}
                      </Text>
                    </HStack>

                    {/* Quote Content */}
                    <Box p={4}>
                      {selectedDocument.isLoading ? (
                        <HStack gap={2}>
                          <Spinner size="sm" color="blue.500" />
                          <Text fontSize="sm" color="gray.500">
                            Extracting relevant quote...
                          </Text>
                        </HStack>
                      ) : (
                        <Text
                          fontSize="sm"
                          color="gray.800"
                          _dark={{ color: "gray.100" }}
                          lineHeight="1.8"
                          fontStyle="italic"
                        >
                          "{selectedDocument.highlight
                            .replace(/([a-z])([A-Z])/g, '$1 $2')
                            .replace(/\s+/g, ' ')
                            .trim()}"
                        </Text>
                      )}
                    </Box>
                  </Box>
                </Box>
              )}

              {/* Open PDF Button */}
              {selectedDocument.isPDF && selectedDocument.pdfData && (
                <Button
                  mt={4}
                  w="full"
                  size="sm"
                  variant="outline"
                  leftIcon={<FiExternalLink />}
                  onClick={() => {
                    // Open PDF in new tab or expand view
                    const pdfWindow = window.open('', '_blank');
                    pdfWindow.document.write(`
                      <html>
                        <head><title>${selectedDocument.name}</title></head>
                        <body style="margin:0;padding:0;">
                          <embed src="${selectedDocument.pdfData}" type="application/pdf" width="100%" height="100%" />
                        </body>
                      </html>
                    `);
                  }}
                >
                  Open full PDF
                </Button>
              )}
            </Box>
          </>
        )}
      </Box>

      {/* Backdrop - only show on mobile or when needed */}
      {documentModalOpen && selectedDocument && (
        <Box
          display={{ base: "block", md: "none" }}
          position="fixed"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bg="blackAlpha.500"
          zIndex={1000}
          onClick={() => setDocumentModalOpen(false)}
        />
      )}

    </>
  );
}
