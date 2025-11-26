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
  Input,
  InputGroup,
} from "@chakra-ui/react";
import Image from "next/image";
import { FiMenu, FiPlus, FiSun, FiMoon, FiSend, FiX, FiUpload, FiFile, FiLink, FiCheck, FiArrowLeft, FiImage, FiExternalLink, FiTrash2, FiSearch, FiFileText } from "react-icons/fi";
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
  const [customTheme, setCustomTheme] = useState("light"); // "light", "dark", or "retro"
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
  const [showUploadInterface, setShowUploadInterface] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [podcastAudio, setPodcastAudio] = useState(null);
  const [podcastScript, setPodcastScript] = useState(null);
  const [isGeneratingPodcast, setIsGeneratingPodcast] = useState(false);
  const [showPodcastPlayer, setShowPodcastPlayer] = useState(false);
  const [savedMaterials, setSavedMaterials] = useState([]); // Array of all generated materials
  const [webSearchQuery, setWebSearchQuery] = useState(""); // Web search query
  const [webSearchResults, setWebSearchResults] = useState([]); // Web search results
  const [isSearchingWeb, setIsSearchingWeb] = useState(false); // Loading state for web search
  const [isDragging, setIsDragging] = useState(false); // Drag-and-drop state

  // Autocomplete for @mentions
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteOptions, setAutocompleteOptions] = useState([]);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(0);

  // Fix hydration error for color mode
  useEffect(() => {
    setMounted(true);
    // Load custom theme from localStorage
    const savedTheme = localStorage.getItem('customTheme');
    if (savedTheme && ['light', 'dark', 'retro'].includes(savedTheme)) {
      setCustomTheme(savedTheme);
    }
  }, []);

  // Cycle through themes: light → dark → retro → light
  const cycleTheme = () => {
    const themeOrder = ['light', 'dark', 'retro'];
    const currentIndex = themeOrder.indexOf(customTheme);
    const nextTheme = themeOrder[(currentIndex + 1) % themeOrder.length];
    setCustomTheme(nextTheme);
    localStorage.setItem('customTheme', nextTheme);

    // Also update Chakra's color mode for light/dark
    if (nextTheme === 'light' && colorMode === 'dark') {
      toggleColorMode();
    } else if (nextTheme === 'dark' && colorMode === 'light') {
      toggleColorMode();
    } else if (nextTheme === 'retro' && colorMode === 'dark') {
      toggleColorMode(); // Set to light mode for retro
    }
  };

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
              id: f.id,  // Include ID for deletion
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
          content: `Successfully scraped "${data.title}" from ${url} (${data.chunksAdded} chunks added to knowledge base)`,
        },
      ]);

      // Show success toast
      toaster.create({
        title: "Paper Added Successfully",
        description: `"${data.title}" has been added to your knowledge base (${data.chunksAdded} chunks)`,
        status: "success",
        duration: 5000,
      });

      // Close upload interface if it was open
      setShowUploadInterface(false);

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

    // Check file size before uploading
    const fileSizeMB = file.size / (1024 * 1024);
    const maxSizeMB = 100;

    if (fileSizeMB > maxSizeMB) {
      toaster.create({
        title: "File Too Large",
        description: `File size is ${fileSizeMB.toFixed(1)}MB. Maximum allowed size is ${maxSizeMB}MB.`,
        status: "error",
        duration: 7000,
      });
      event.target.value = "";
      return;
    }

    setIsUploading(true);

    // Show progress toast for large files (>10MB)
    if (fileSizeMB > 10) {
      toaster.create({
        title: "Uploading Large File",
        description: `Processing ${file.name} (${fileSizeMB.toFixed(1)}MB). This may take a few minutes...`,
        status: "info",
        duration: 5000,
      });
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sessionId", sessionId); // Add session ID for isolation

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed with status ${response.status}`);
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
          content: `Successfully uploaded and processed "${file.name}" (${data.chunksAdded} chunks added to knowledge base)${data.method === 'GPT-4 Vision' ? ' using GPT-4 Vision' : ''}`,
        },
      ]);

      // Show success toast
      toaster.create({
        title: "Document Uploaded Successfully",
        description: `"${file.name}" has been processed (${data.chunksAdded} chunks)${data.method === 'GPT-4 Vision' ? ' using GPT-4 Vision' : ''}`,
        status: "success",
        duration: 5000,
      });

      // Close upload interface if it was open
      setShowUploadInterface(false);

      // Reset file input
      event.target.value = "";
    } catch (error) {
      console.error("Upload error:", error);

      // Provide specific error messages
      let errorMessage = error.message || "Failed to process the document.";

      if (errorMessage.includes('too large') || errorMessage.includes('LIMIT_FILE_SIZE')) {
        errorMessage = `File is too large. Maximum size is ${maxSizeMB}MB. Your file is ${fileSizeMB.toFixed(1)}MB.`;
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        errorMessage = `Upload timed out. The file may be too large or complex. Try a smaller file or contact support.`;
      } else if (fileSizeMB > 50) {
        errorMessage = `Failed to process large file (${fileSizeMB.toFixed(1)}MB). ${errorMessage}`;
      }

      toaster.create({
        title: "Upload Failed",
        description: errorMessage,
        status: "error",
        duration: 7000,
      });

      // Reset file input
      event.target.value = "";
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteFile = async (index) => {
    const fileToDelete = uploadedFiles[index];

    // Optimistically update UI
    const updatedFiles = uploadedFiles.filter((_, idx) => idx !== index);
    setUploadedFiles(updatedFiles);

    // Add system message about deletion
    setMessages([
      ...messages,
      {
        role: "system",
        content: `🗑️ Removed "${fileToDelete.name}" from sources`,
      },
    ]);

    toaster.create({
      title: "Source Removed",
      description: `"${fileToDelete.name}" has been removed from sources`,
      type: "info",
      duration: 3000,
    });

    // Delete from backend if file has an ID (from database)
    if (fileToDelete.id) {
      try {
        const response = await fetch('/api/files', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: fileToDelete.id }),
        });

        if (!response.ok) {
          throw new Error('Failed to delete file from database');
        }

        // Delete vectors from Pinecone
        const deleteVectorsResponse = await fetch(`/api/delete-file-vectors`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: sessionId,
            fileName: fileToDelete.name
          }),
        });

        if (deleteVectorsResponse.ok) {
          console.log(`✅ Deleted vectors for ${fileToDelete.name}`);
        }
      } catch (error) {
        console.error('Error deleting file:', error);
        toaster.create({
          title: "Warning",
          description: "File removed from UI but may still exist in database",
          type: "warning",
          duration: 3000,
        });
      }
    }
  };

  const handleWebSearch = async (query) => {
    if (!query.trim()) {
      setWebSearchResults([]);
      return;
    }

    setIsSearchingWeb(true);
    try {
      const response = await fetch('/api/web-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Check if it's a configuration error
        if (response.status === 503 && data.message) {
          toaster.create({
            title: "Web Search Not Configured",
            description: data.message,
            type: "warning",
            duration: 5000,
          });
        } else {
          throw new Error(data.error || 'Web search failed');
        }
        setWebSearchResults([]);
        return;
      }

      setWebSearchResults(data.results || []);
    } catch (error) {
      console.error('Web search error:', error);
      toaster.create({
        title: "Search Failed",
        description: "Unable to search the web. Please try again.",
        type: "error",
        duration: 3000,
      });
      setWebSearchResults([]);
    } finally {
      setIsSearchingWeb(false);
    }
  };

  const handleAddWebSource = async (result) => {
    try {
      setIsUploading(true);

      const response = await fetch('/api/add-web-source', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: result.url,
          title: result.title,
          snippet: result.snippet,
          sessionId: sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to add web source');
      }

      const data = await response.json();

      // Add to uploaded files
      setUploadedFiles([...uploadedFiles, {
        name: result.title,
        type: 'url',
        url: result.url,
        chunks: data.chunks,
        id: data.fileId,
      }]);

      toaster.create({
        title: "Source Added",
        description: `Added "${result.title}" to your sources`,
        type: "success",
        duration: 3000,
      });

      // Remove from search results
      setWebSearchResults(webSearchResults.filter(r => r.url !== result.url));
    } catch (error) {
      console.error('Error adding web source:', error);
      toaster.create({
        title: "Error",
        description: "Failed to add web source. Please try again.",
        type: "error",
        duration: 3000,
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Drag and drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      // Process each file
      Array.from(files).forEach((file) => {
        const fakeEvent = {
          target: {
            files: [file]
          }
        };
        handleFileUpload(fakeEvent);
      });
    }
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

      // Add to saved materials array
      const newMaterial = {
        id: Date.now(),
        type: type,
        data: data,
        timestamp: new Date(),
        count: type === 'flashcards' ? data.flashcards?.length : (type === 'quiz' ? data.questions?.length : null),
      };
      setSavedMaterials([newMaterial, ...savedMaterials]); // Newest first

      // Set current studio content for immediate use
      setStudioContent(data);
      setStudioType(type);

      // Only auto-open modal for quiz
      if (type === 'quiz') {
        setStudioModalOpen(true);
      }
      setCurrentFlashcardIndex(0);
      setShowFlashcardAnswer(false);
      setQuizAnswers({});
      setShowQuizResults(false);

      toaster.create({
        title: `${type.charAt(0).toUpperCase() + type.slice(1)} Ready!`,
        description: type === 'flashcards' ? `${data.flashcards?.length || 0} flashcards ready to study` : "Your study material is ready!",
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

  const generatePodcast = async () => {
    console.log('🎙️ Podcast button clicked');
    setIsGeneratingPodcast(true);

    try {
      console.log('📡 Calling podcast API...');
      const response = await fetch('/api/generate-podcast', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: sessionId,
        }),
      });

      console.log('📡 Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ API Error:', errorData);
        throw new Error(errorData.error || 'Failed to generate podcast');
      }

      const data = await response.json();
      console.log('✅ Podcast data received:', {
        hasAudio: !!data.audioUrl,
        hasScript: !!data.script,
        fileCount: data.fileCount
      });

      // Add to saved materials array
      const newMaterial = {
        id: Date.now(),
        type: 'podcast',
        audioUrl: data.audioUrl,
        script: data.script,
        fileCount: data.fileCount,
        timestamp: new Date(),
      };
      setSavedMaterials([newMaterial, ...savedMaterials]); // Newest first
      console.log('✅ Podcast saved to materials');

      toaster.create({
        title: "Podcast Ready!",
        description: `Your ${data.fileCount}-source study podcast is ready to play`,
        type: "success",
        duration: 3000,
      });
    } catch (error) {
      console.error('❌ Podcast generation error:', error);
      toaster.create({
        title: "Generation Failed",
        description: error.message || "Could not generate podcast",
        type: "error",
        duration: 5000,
      });
    } finally {
      setIsGeneratingPodcast(false);
      console.log('🏁 Podcast generation finished');
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

    // Fix run-together words and PDF extraction artifacts for better readability
    const fixRunTogetherWords = (text) => {
      return text
        // FIRST: Fix spaces within words (e.g., "Envir onment" -> "Environment", "Y ou've" -> "You've")
        // Pattern: Capital letter + lowercase letters + space + lowercase letters (likely broken word)
        .replace(/\b([A-Z][a-z]{1,4})\s+([a-z]{2,})\b/g, '$1$2')

        // Fix single capital letter + space + lowercase word (e.g., "Y ou" -> "You")
        .replace(/\b([A-Z])\s+([a-z]{2,})\b/g, '$1$2')

        // Fix lowercase word fragment + space + lowercase continuation (e.g., "applicatio n" -> "application")
        .replace(/([a-z]{5,})\s+([a-z]{1,3})\b/g, '$1$2')

        // Fix excessive character spacing (e.g., "D e v e l o p m e n t" -> "Development")
        .replace(/\b([a-zA-Z])\s+([a-zA-Z])\s+([a-zA-Z])\s+([a-zA-Z])\s+([a-zA-Z])\s*/g, (match) => {
          return match.replace(/\s+/g, '');
        })
        .replace(/([a-zA-Z])\s+([a-zA-Z])\s+([a-zA-Z])\s+([a-zA-Z])(?=\s+[a-zA-Z]\s)/g, (match) => {
          return match.replace(/\s+/g, '');
        })

        // Add space between lowercase and uppercase letters (camelCase)
        .replace(/([a-z])([A-Z])/g, '$1 $2')

        // Fix common PDF extraction artifacts
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

        // Fix broken words with spaces in the middle
        .replace(/\b([a-z])\s+([a-z]{2,})\b/g, (match, p1, p2) => {
          // Only join if it looks like a broken word (e.g., "v ariables" -> "variables")
          if (p1.length === 1 && p2.length > 2) {
            return p1 + p2;
          }
          return match;
        })

        // Normalize multiple spaces
        .replace(/\s+/g, ' ')

        // Fix spacing around punctuation
        .replace(/\s+([.,!?;:])/g, '$1')
        .replace(/([.,!?;:])\s+/g, '$1 ')

        .trim();
    };

    // Show the verbatim quote if available, otherwise show chunk preview
    const getDisplayText = () => {
      let text;

      // If we have a verbatim quote, show that (it's what the AI cited)
      if (citation?.quote) {
        text = citation.quote;
      } else if (citation?.content) {
        // Normalize whitespace
        const cleaned = citation.content.replace(/\s+/g, ' ').trim();

        // Try to extract complete sentences
        const sentences = cleaned.match(/[^.!?]+[.!?]+/g);

        if (sentences && sentences.length > 0) {
          // Get first 1-2 sentences that fit within ~300 chars
          let result = '';
          for (let i = 0; i < Math.min(2, sentences.length); i++) {
            const sentence = sentences[i].trim();
            if ((result + sentence).length <= 300) {
              result += (result ? ' ' : '') + sentence;
            } else if (result === '') {
              // If first sentence is too long, truncate it smartly
              result = sentence.substring(0, 280).trim();
              // Find last complete word
              const lastSpace = result.lastIndexOf(' ');
              if (lastSpace > 200) {
                result = result.substring(0, lastSpace) + '...';
              } else {
                result += '...';
              }
            }
          }
          text = result;
        } else {
          // No sentence breaks found, truncate smartly
          if (cleaned.length <= 300) {
            text = cleaned;
          } else {
            text = cleaned.substring(0, 280).trim();
            // Find last complete word
            const lastSpace = text.lastIndexOf(' ');
            if (lastSpace > 200) {
              text = text.substring(0, lastSpace) + '...';
            } else {
              text += '...';
            }
          }
        }
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
            onMouseLeave={() => setIsOpen(false)}
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
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
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
                  {(() => {
                    const source = citation?.source || 'Unknown Source';
                    const page = citation?.page ? `, Page ${citation.page}` : '';
                    const lineSpan = citation?.lineSpan ? ` (${citation.lineSpan})` : '';
                    return `From ${source}${page}${lineSpan}:`;
                  })()}
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
                  <Text fontSize="9px" color="gray.500" mt={1}>
                    Approximate match ({Math.round(citation.confidence * 100)}%)
                  </Text>
                )}

                {/* Open PDF Button */}
                {citation?.source?.endsWith('.pdf') && citation?.page && (
                  <Button
                    size="xs"
                    variant="ghost"
                    mt={2}
                    w="full"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Find the uploaded file to get PDF data
                      const uploadedFile = uploadedFiles.find(f => f.name === citation.source);
                      if (uploadedFile?.pdfData) {
                        setCurrentPdfData(uploadedFile.pdfData);
                        setCurrentPdfPage(citation.page);
                        // Use the EXACT same text that's displayed in the citation
                        const displayedText = getDisplayText();
                        setCurrentHighlightText(displayedText);
                        setPdfViewerVisible(true);
                      }
                    }}
                    fontSize="xs"
                    color="blue.600"
                    _hover={{ bg: "blue.50" }}
                    _dark={{ color: "blue.400", _hover: { bg: "blue.900" } }}
                    leftIcon={<FiExternalLink size={12} />}
                  >
                    Open PDF
                  </Button>
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

    // Handle assistant messages with citations OR citation markers in text
    if (msg.role === "assistant") {
      const content = msg.content;

      // Check if content contains citation markers
      const hasCitationMarkers = /\[CHUNK-\d+(?::"[^"]*"|:[\d,-]+)?\]/.test(content);

      if (msg.citations || hasCitationMarkers) {
        const messageCitations = msg.citations || []; // Use citations from this message or empty array

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
    }

    // Default text rendering
    return <Text whiteSpace="pre-wrap">{msg.content}</Text>;
  };

  // Handle message input change and detect @mentions for autocomplete
  const handleMessageChange = (e) => {
    const newMessage = e.target.value;
    setMessage(newMessage);

    // Get cursor position
    const cursorPos = e.target.selectionStart;

    // Find the last @ before cursor
    const textBeforeCursor = newMessage.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    // Check if we're in an @mention context
    if (lastAtIndex !== -1) {
      // Get the text after @ up to cursor
      const afterAt = textBeforeCursor.substring(lastAtIndex + 1);

      // Check if there's a space or quote after @ (which would end the mention)
      const hasSpace = afterAt.includes(' ');
      const isInQuotes = afterAt.startsWith('"') && !afterAt.includes('"', 1);

      // Only show autocomplete if we're actively typing a mention
      if (!hasSpace || isInQuotes) {
        const searchTerm = isInQuotes ? afterAt.substring(1) : afterAt;

        // Filter uploaded files based on search term
        const filtered = uploadedFiles.filter(file =>
          file.name.toLowerCase().includes(searchTerm.toLowerCase())
        );

        if (filtered.length > 0) {
          setAutocompleteOptions(filtered);
          setShowAutocomplete(true);
          setAutocompleteIndex(0);
          setMentionStartPos(lastAtIndex);
        } else {
          setShowAutocomplete(false);
        }
      } else {
        setShowAutocomplete(false);
      }
    } else {
      setShowAutocomplete(false);
    }
  };

  // Insert selected file from autocomplete
  const insertMention = (file) => {
    const beforeMention = message.substring(0, mentionStartPos);
    const afterCursor = message.substring(message.length);

    // Wrap in quotes if filename has spaces
    const hasSpaces = file.name.includes(' ');
    const mention = hasSpaces ? `@"${file.name}"` : `@${file.name}`;

    setMessage(beforeMention + mention + ' ' + afterCursor);
    setShowAutocomplete(false);
    setAutocompleteIndex(0);
  };

  const sendMessage = async (messageText) => {
    if ((!messageText.trim() && selectedImages.length === 0) || isLoading) return;

    // Parse @mentions of PDF files
    const mentionRegex = /@"([^"]+)"|@(\S+)/g;
    const mentions = [];
    let match;
    while ((match = mentionRegex.exec(messageText)) !== null) {
      const mentionedFile = match[1] || match[2];
      // Check if this file exists in uploaded files
      const exists = uploadedFiles.some(f =>
        f.name.toLowerCase().includes(mentionedFile.toLowerCase())
      );
      if (exists) {
        mentions.push(mentionedFile);
      }
    }

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
          mentionedSources: mentions.length > 0 ? mentions : null, // Pass @mentioned PDFs
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
        <title>Chat - Researchella</title>
        <meta name="description" content="Chat with Researchella AI" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link href="https://fonts.googleapis.com/css2?family=Righteous&family=Kalam:wght@400;700&display=swap" rel="stylesheet" />
        <style>{`
          .retro-newspaper-bg {
            background:
              radial-gradient(circle, rgba(0, 0, 0, 0.03) 1px, transparent 1px),
              radial-gradient(circle, rgba(0, 0, 0, 0.03) 1px, transparent 1px),
              repeating-linear-gradient(
                0deg,
                transparent,
                transparent 2px,
                rgba(139, 58, 26, 0.01) 2px,
                rgba(139, 58, 26, 0.01) 4px
              ),
              repeating-linear-gradient(
                90deg,
                transparent,
                transparent 2px,
                rgba(139, 58, 26, 0.01) 2px,
                rgba(139, 58, 26, 0.01) 4px
              ),
              #F5E6D3;
            background-size:
              20px 20px,
              20px 20px,
              100% 100%,
              100% 100%,
              100% 100%;
            background-position:
              0 0,
              10px 10px,
              0 0,
              0 0,
              0 0;
          }

          .retro-heading {
            font-family: 'Righteous', cursive;
            color: #8B3A1A;
            text-transform: uppercase;
            letter-spacing: 0.02em;
          }

          .retro-text {
            font-family: 'Kalam', cursive;
            color: #8B3A1A;
          }

          .retro-card {
            background: rgba(255, 244, 230, 0.9);
            border: 3px solid #8B3A1A;
            border-radius: 12px;
          }

          .retro-button {
            border: 3px solid #8B3A1A;
            border-radius: 50px;
            background: #BF572A;
            color: #FFF4E6;
            font-family: 'Righteous', cursive;
            box-shadow: 4px 4px 0px #8B3A1A;
            transition: all 0.2s;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }

          .retro-button:hover {
            transform: translate(2px, 2px);
            box-shadow: 2px 2px 0px #8B3A1A;
          }
        `}</style>
      </Head>

      <Flex
        h="100vh"
        overflow="hidden"
        position="relative"
        bg={customTheme === "retro" ? "#F5E6D3" : "gray.50"}
        _dark={{ bg: customTheme === "retro" ? "#F5E6D3" : "gray.950" }}
        className={customTheme === "retro" ? "retro-newspaper-bg" : ""}
      >
        {/* LEFT PANEL: Sources Sidebar (NotebookLM style) */}
        <Box
          w="240px"
          bg={customTheme === "retro" ? "rgba(255, 244, 230, 0.9)" : "white"}
          _dark={{ bg: customTheme === "retro" ? "rgba(255, 244, 230, 0.9)" : "gray.900", borderColor: customTheme === "retro" ? "#8B3A1A" : "gray.800" }}
          borderRightWidth="1px"
          borderColor={customTheme === "retro" ? "#8B3A1A" : "gray.100"}
          display={{ base: "none", lg: "block" }}
          overflowY="auto"
          css={{
            '&::-webkit-scrollbar': {
              width: '6px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              background: '#CBD5E0',
              borderRadius: '3px',
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: '#A0AEC0',
            },
          }}
        >
          <VStack gap={3} align="stretch" p={4} pt={3}>
            <Box display="flex" justifyContent="center">
              <Image
                src="/logo.png"
                alt="Researchella"
                width={100}
                height={32}
                style={{ objectFit: "contain" }}
              />
            </Box>

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
                onClick={() => setShowUploadInterface(true)}
              >
                Add sources
              </Button>

              {/* Web Search Input - NotebookLM Style */}
              <Box position="relative" mb={3}>
                <Input
                  placeholder="Search the web for sources"
                  value={webSearchQuery}
                  onChange={(e) => setWebSearchQuery(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleWebSearch(webSearchQuery);
                    }
                  }}
                  size="sm"
                  borderRadius="lg"
                  bg="gray.50"
                  _dark={{ bg: "gray.800", borderColor: "gray.700" }}
                  borderColor="gray.200"
                  _hover={{ borderColor: "gray.300", _dark: { borderColor: "gray.600" } }}
                  _focus={{ borderColor: "blue.500", boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)" }}
                  pl={9}
                  pr={webSearchQuery ? 20 : 3}
                  fontSize="sm"
                />
                <Box
                  position="absolute"
                  left={3}
                  top="50%"
                  transform="translateY(-50%)"
                  color="gray.400"
                  _dark={{ color: "gray.500" }}
                  pointerEvents="none"
                >
                  <FiSearch size={14} />
                </Box>
                {webSearchQuery && (
                  <IconButton
                    icon={<FiX />}
                    size="xs"
                    variant="ghost"
                    position="absolute"
                    right={1}
                    top="50%"
                    transform="translateY(-50%)"
                    onClick={() => {
                      setWebSearchQuery("");
                      setWebSearchResults([]);
                    }}
                    aria-label="Clear search"
                    color="gray.400"
                    _hover={{ color: "gray.600", bg: "gray.100", _dark: { color: "gray.300", bg: "gray.700" } }}
                  />
                )}
              </Box>

              {/* Web Search Results */}
              {isSearchingWeb && (
                <Box p={4} textAlign="center">
                  <Spinner size="sm" color="blue.500" />
                  <Text fontSize="xs" color="gray.500" _dark={{ color: "gray.400" }} mt={2}>
                    Searching the web...
                  </Text>
                </Box>
              )}

              {webSearchResults.length > 0 && (
                <VStack gap={2} align="stretch" mb={3}>
                  <Text fontSize="xs" fontWeight="600" color="gray.600" _dark={{ color: "gray.400" }}>
                    SEARCH RESULTS ({webSearchResults.length})
                  </Text>
                  {webSearchResults.map((result, idx) => (
                    <Box
                      key={idx}
                      p={3}
                      borderRadius="lg"
                      bg="white"
                      _dark={{ bg: "gray.800" }}
                      border="1px solid"
                      borderColor="gray.200"
                      _dark={{ borderColor: "gray.700" }}
                      transition="all 0.2s"
                      _hover={{ borderColor: "blue.400", shadow: "sm" }}
                    >
                      <VStack align="start" gap={2}>
                        <VStack align="start" gap={0}>
                          <Text fontSize="xs" fontWeight="600" noOfLines={2}>
                            {result.title}
                          </Text>
                          <Text fontSize="xs" color="gray.500" _dark={{ color: "gray.400" }} noOfLines={2}>
                            {result.snippet}
                          </Text>
                          <Text fontSize="xs" color="blue.600" _dark={{ color: "blue.400" }} noOfLines={1}>
                            {result.url}
                          </Text>
                        </VStack>
                        <Button
                          size="xs"
                          colorScheme="blue"
                          w="full"
                          onClick={() => handleAddWebSource(result)}
                          isLoading={isUploading}
                          leftIcon={<FiPlus />}
                        >
                          Add to sources
                        </Button>
                      </VStack>
                    </Box>
                  ))}
                </VStack>
              )}

              {webSearchResults.length === 0 && webSearchQuery && !isSearchingWeb && (
                <Box
                  p={3}
                  mb={3}
                  textAlign="center"
                  bg="gray.50"
                  _dark={{ bg: "gray.800" }}
                  borderRadius="lg"
                  border="1px solid"
                  borderColor="gray.200"
                  _dark={{ borderColor: "gray.700" }}
                >
                  <Text fontSize="xs" color="gray.500" _dark={{ color: "gray.400" }}>
                    Press Enter to search
                  </Text>
                </Box>
              )}

              {/* Sources List */}
              {uploadedFiles.length > 0 && (
                <VStack gap={2} align="stretch">
                  <HStack justify="space-between" align="center" mb={1}>
                    <Text fontSize="xs" fontWeight="600" color="gray.600" _dark={{ color: "gray.400" }}>
                      SOURCES ({uploadedFiles.length})
                    </Text>
                    <HStack gap={2}>
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
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={async () => {
                          if (selectedSources.length === 0) return;

                          const fileCount = selectedSources.length;
                          const confirmDelete = window.confirm(`Delete ${fileCount} selected file(s)? This cannot be undone.`);
                          if (!confirmDelete) return;

                          // Get selected files to delete
                          const filesToDelete = selectedSources
                            .map(idx => uploadedFiles[idx])
                            .filter(f => f !== undefined);

                          // Delete selected files
                          for (const file of filesToDelete) {
                            const index = uploadedFiles.findIndex(f => f.name === file.name);
                            if (index !== -1) {
                              await handleDeleteFile(index);
                            }
                          }

                          // Clear selection after deletion
                          setSelectedSources([]);

                          toaster.create({
                            title: "Sources Deleted",
                            description: `Removed ${fileCount} selected file(s)`,
                            type: "success",
                            duration: 3000,
                          });
                        }}
                        fontSize="xs"
                        color="blue.600"
                        _dark={{ color: "blue.400" }}
                        fontWeight="600"
                        _hover={{ bg: "blue.50", _dark: { bg: "blue.900" } }}
                        isDisabled={selectedSources.length === 0}
                      >
                        Delete All
                      </Button>
                    </HStack>
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
                          icon={<FiX />}
                          size="sm"
                          variant="ghost"
                          aria-label="Delete file"
                          position="absolute"
                          top={2}
                          right={2}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFile(idx);
                          }}
                          color="black"
                          _hover={{ color: "red.600", bg: "red.50" }}
                          _dark={{ color: "gray.300", _hover: { color: "red.400", bg: "red.900" } }}
                          zIndex={10}
                          fontSize="16px"
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
                <Box flex={1}>
                  <Image
                    src="/logo.png"
                    alt="Researchella"
                    width={120}
                    height={40}
                    style={{ objectFit: "contain" }}
                  />
                </Box>
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
                        <HStack key={index} gap={2} p={2} borderRadius="md" bg="gray.50" _dark={{ bg: "gray.700" }} position="relative" role="group">
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
                          <IconButton
                            icon={<FiX />}
                            size="xs"
                            variant="ghost"
                            aria-label="Delete file"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFile(index);
                            }}
                            color="gray.500"
                            _hover={{ color: "gray.900", bg: "gray.200" }}
                            _dark={{ color: "gray.400", _hover: { color: "gray.100", bg: "gray.600" } }}
                            minW="auto"
                            h="auto"
                            p={1}
                          />
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
            _dark={{ borderColor: "gray.800" }}
            bg="white"
            _dark={{ bg: "gray.900" }}
            align="center"
            gap={4}
            shadow="sm"
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
            ) : null}

            <input
              id="file-upload"
              type="file"
              accept=".pdf,.txt,.md,.csv,.json,.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg"
              multiple
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />
            <Box
              as="button"
              onClick={cycleTheme}
              aria-label="Cycle theme (Light / Dark / Retro)"
              fontSize="20px"
              color={customTheme === "retro" ? "#8B3A1A" : "gray.600"}
              _dark={{ color: customTheme === "retro" ? "#8B3A1A" : "gray.400" }}
              cursor="pointer"
              transition="color 0.2s"
              _hover={{
                color: customTheme === "retro" ? "#BF572A" : "gray.900",
                _dark: { color: customTheme === "retro" ? "#BF572A" : "gray.100" }
              }}
              display="flex"
              alignItems="center"
              justifyContent="center"
              p={2}
              borderRadius="md"
            >
              {!mounted ? (
                <FiSun />
              ) : customTheme === "light" ? (
                <FiSun />
              ) : customTheme === "dark" ? (
                <FiMoon />
              ) : (
                <FiFileText />
              )}
            </Box>
          </Flex>

          {/* Messages Area */}
          <Box
            flex={1}
            overflowY="auto"
            p={6}
            bg={customTheme === "retro" ? "transparent" : "gray.50"}
            _dark={{ bg: customTheme === "retro" ? "transparent" : "gray.950" }}
          >
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
                            onClick={() => {
                              if (messages.length === 0) {
                                setMessages([{ role: "system", content: "Chat started without documents" }]);
                              }
                            }}
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
                <VStack gap={4} align="stretch" py={4}>
                  {messages.map((msg, index) => (
                    <HStack
                      key={index}
                      gap={3}
                      align="start"
                      justify={msg.role === "user" ? "flex-end" : "flex-start"}
                      w="full"
                    >
                      {msg.role === "system" ? (
                        <Box
                          w="full"
                          textAlign="center"
                          color="gray.500"
                          _dark={{ color: "gray.400" }}
                          fontSize="sm"
                          fontStyle="italic"
                          py={2}
                        >
                          {renderMessageContent(msg)}
                        </Box>
                      ) : (
                        <>
                          {msg.role === "assistant" && (
                            <Box
                              w="32px"
                              h="32px"
                              borderRadius="full"
                              bg="gradient-to-br from-blue-500 to-purple-600"
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                              flexShrink={0}
                              mt={1}
                            >
                              <Text fontSize="sm" fontWeight="bold" color="white">
                                AI
                              </Text>
                            </Box>
                          )}
                          <Box
                            maxW="85%"
                            bg={
                              msg.role === "user"
                                ? "gray.900"
                                : "white"
                            }
                            _dark={{
                              bg: msg.role === "user" ? "gray.700" : "gray.900"
                            }}
                            px={4}
                            py={3}
                            borderRadius="2xl"
                            shadow={msg.role === "user" ? "sm" : "sm"}
                            border={msg.role === "assistant" ? "1px solid" : "none"}
                            borderColor="gray.200"
                            _dark={{
                              borderColor: "gray.700"
                            }}
                            transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                            _hover={msg.role === "assistant" ? {
                              shadow: "md",
                              borderColor: "gray.300",
                              _dark: { borderColor: "gray.600" }
                            } : {}}
                          >
                            <Box
                              color={msg.role === "user" ? "white" : "gray.800"}
                              _dark={{ color: msg.role === "user" ? "white" : "gray.100" }}
                              fontSize="sm"
                              lineHeight="1.6"
                            >
                              {renderMessageContent(msg)}
                            </Box>
                          </Box>
                          {msg.role === "user" && (
                            <Box
                              w="32px"
                              h="32px"
                              borderRadius="full"
                              bg="gradient-to-br from-green-400 to-emerald-600"
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                              flexShrink={0}
                              mt={1}
                            >
                              <Text fontSize="xs" fontWeight="bold" color="white">
                                U
                              </Text>
                            </Box>
                          )}
                        </>
                      )}
                    </HStack>
                  ))}
                  {isLoading && (
                    <HStack gap={3} align="start">
                      <Box
                        w="32px"
                        h="32px"
                        borderRadius="full"
                        bg="gradient-to-br from-blue-500 to-purple-600"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        flexShrink={0}
                      >
                        <Text fontSize="sm" fontWeight="bold" color="white">
                          AI
                        </Text>
                      </Box>
                      <Box
                        bg="white"
                        _dark={{ bg: "gray.900" }}
                        px={4}
                        py={3}
                        borderRadius="2xl"
                        border="1px solid"
                        borderColor="gray.200"
                        _dark={{ borderColor: "gray.700" }}
                      >
                        <HStack gap={1}>
                          <Box
                            w="2px"
                            h="2px"
                            borderRadius="full"
                            bg="gray.400"
                            animation="pulse 1.4s ease-in-out infinite"
                          />
                          <Box
                            w="2px"
                            h="2px"
                            borderRadius="full"
                            bg="gray.400"
                            animation="pulse 1.4s ease-in-out 0.2s infinite"
                          />
                          <Box
                            w="2px"
                            h="2px"
                            borderRadius="full"
                            bg="gray.400"
                            animation="pulse 1.4s ease-in-out 0.4s infinite"
                          />
                        </HStack>
                      </Box>
                    </HStack>
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
            _dark={{ borderColor: "gray.800", bg: "gray.900" }}
            bg="white"
            shadow="md"
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
                      Direct
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
                      Interactive
                    </Button>
                  </HStack>
                  <Text fontSize="xs" color="gray.500" _dark={{ color: "gray.400" }} fontStyle="italic">
                    {tutoringMode === "direct" ? "Get straight answers" : "Learn through Socratic questioning"}
                  </Text>
                </HStack>

                {/* Input Area - Minimalistic Design */}
                <HStack gap={2} align="end" position="relative">
                  <Box position="relative" flex={1}>
                    <Textarea
                      placeholder={uploadedFiles.length > 0 ? "Ask me anything... (Tip: Use @filename to query specific docs)" : "Ask me anything about your research..."}
                      value={message}
                      onChange={handleMessageChange}
                      resize="none"
                      rows={1}
                      minH="44px"
                      maxH="200px"
                      overflow="auto"
                      w="100%"
                      bg="white"
                      _dark={{ bg: "gray.800" }}
                      border="1px solid"
                      borderColor="gray.300"
                      _dark={{ borderColor: "gray.700" }}
                      borderRadius="xl"
                      px={4}
                      py={3}
                      fontSize="sm"
                      _focus={{
                        outline: "none",
                        borderColor: "gray.400",
                        _dark: { borderColor: "gray.600" }
                      }}
                      _placeholder={{
                        color: "gray.400",
                        _dark: { color: "gray.500" }
                      }}
                      onKeyDown={(e) => {
                        if (showAutocomplete) {
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setAutocompleteIndex((prev) =>
                              prev < autocompleteOptions.length - 1 ? prev + 1 : prev
                            );
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setAutocompleteIndex((prev) => (prev > 0 ? prev - 1 : prev));
                          } else if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            insertMention(autocompleteOptions[autocompleteIndex]);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setShowAutocomplete(false);
                          }
                        } else if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage(message);
                        }
                      }}
                    />

                    {/* Autocomplete Dropdown */}
                    {showAutocomplete && autocompleteOptions.length > 0 && (
                      <Box
                        position="absolute"
                        bottom="100%"
                        left={0}
                        mb={2}
                        w="full"
                        maxH="200px"
                        overflowY="auto"
                        bg="white"
                        _dark={{ bg: "gray.800" }}
                        border="1px solid"
                        borderColor="gray.200"
                        _dark={{ borderColor: "gray.700" }}
                        borderRadius="lg"
                        boxShadow="lg"
                        zIndex={1000}
                      >
                        {autocompleteOptions.map((file, idx) => (
                          <Box
                            key={idx}
                            px={3}
                            py={2}
                            cursor="pointer"
                            bg={idx === autocompleteIndex ? "blue.50" : "transparent"}
                            _dark={{
                              bg: idx === autocompleteIndex ? "blue.900" : "transparent"
                            }}
                            _hover={{
                              bg: "blue.50",
                              _dark: { bg: "blue.900" }
                            }}
                            onClick={() => insertMention(file)}
                            onMouseEnter={() => setAutocompleteIndex(idx)}
                          >
                            <Text fontSize="sm" noOfLines={1}>
                              {file.name}
                            </Text>
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Box>
                  <IconButton
                    as="label"
                    variant="ghost"
                    aria-label="Upload image"
                    cursor="pointer"
                    isLoading={isUploadingImage}
                    borderRadius="full"
                    size="sm"
                    fontSize="xl"
                    fontWeight="300"
                    color="gray.500"
                    _dark={{ color: "gray.400" }}
                    _hover={{ bg: "gray.100", _dark: { bg: "gray.700" } }}
                  >
                    +
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      style={{ display: "none" }}
                    />
                  </IconButton>
                  <IconButton
                    aria-label="Send message"
                    borderRadius="full"
                    size="sm"
                    fontSize="lg"
                    color="white"
                    bg="gray.900"
                    _dark={{ bg: "gray.100", color: "gray.900" }}
                    transition="all 0.15s"
                    _hover={{
                      bg: "gray.700",
                      _dark: { bg: "gray.300" }
                    }}
                    _active={{
                      transform: "scale(0.95)",
                    }}
                    onClick={() => sendMessage(message)}
                    disabled={(!message.trim() && selectedImages.length === 0) || isLoading}
                    _disabled={{
                      opacity: 0.3,
                      cursor: "not-allowed",
                    }}
                  >
                    ↑
                  </IconButton>
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
          css={{
            '&::-webkit-scrollbar': {
              width: '6px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              background: '#CBD5E0',
              borderRadius: '3px',
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: '#A0AEC0',
            },
          }}
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
              {/* Podcast */}
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
                isDisabled={uploadedFiles.length === 0 || isGeneratingPodcast}
                onClick={generatePodcast}
                isLoading={isGeneratingPodcast}
                loadingText="Generating..."
              >
                <VStack align="start" gap={1} w="full">
                  <Text fontWeight="600" fontSize="sm">
                    Podcast
                  </Text>
                  <Text fontSize="xs" color="gray.500" _dark={{ color: "gray.400" }}>
                    {isGeneratingPodcast ? 'Creating your study podcast...' : 'AI-generated study podcast'}
                  </Text>
                </VStack>
              </Button>

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
                isDisabled={uploadedFiles.length === 0 || (isGeneratingStudio && studioType === 'flashcards')}
                onClick={() => generateStudioContent('flashcards')}
                isLoading={isGeneratingStudio && studioType === 'flashcards'}
                loadingText="Generating..."
              >
                <VStack align="start" gap={1} w="full">
                  <Text fontWeight="600" fontSize="sm">
                    Flashcards
                  </Text>
                  <Text fontSize="xs" color="gray.500" _dark={{ color: "gray.400" }}>
                    {isGeneratingStudio && studioType === 'flashcards' ? 'Creating your study flashcards...' : 'Create study flashcards'}
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
                  <Text fontWeight="600" fontSize="sm">
                    Quiz
                  </Text>
                  <Text fontSize="xs" color="gray.500" _dark={{ color: "gray.400" }}>
                    {isGeneratingStudio && studioType === 'quiz' ? 'Creating your quiz...' : 'Test your understanding'}
                  </Text>
                </VStack>
              </Button>

            </VStack>

            {/* Divider */}
            {savedMaterials.length > 0 && (
              <Box my={4} borderBottom="1px solid" borderColor="gray.200" _dark={{ borderColor: "gray.700" }} />
            )}

            {/* Saved Materials Section - NotebookLM style */}
            {savedMaterials.length > 0 && (
              <VStack gap={2} align="stretch" mt={4}>
                <Text fontSize="xs" fontWeight="700" color="gray.600" _dark={{ color: "gray.400" }} letterSpacing="wider" mb={1}>
                  SAVED MATERIALS ({savedMaterials.length})
                </Text>

                {savedMaterials.map((material) => {
                  const timeAgo = (() => {
                    const seconds = Math.floor((new Date() - material.timestamp) / 1000);
                    if (seconds < 60) return 'Just now';
                    const minutes = Math.floor(seconds / 60);
                    if (minutes < 60) return `${minutes}m ago`;
                    const hours = Math.floor(minutes / 60);
                    if (hours < 24) return `${hours}h ago`;
                    return new Date(material.timestamp).toLocaleDateString();
                  })();

                  return (
                    <Box
                      key={material.id}
                      p={3}
                      bg="white"
                      _dark={{ bg: "gray.800" }}
                      border="1px solid"
                      borderColor="gray.200"
                      _dark={{ borderColor: "gray.700" }}
                      borderRadius="lg"
                      transition="all 0.2s"
                      _hover={{ borderColor: "blue.400", shadow: "sm" }}
                    >
                      <VStack gap={2} align="stretch">
                        <HStack justify="space-between">
                          <VStack align="start" gap={0} flex={1}>
                            <Text fontSize="xs" fontWeight="600" color="gray.800" _dark={{ color: "gray.200" }}>
                              {material.type === 'podcast' && 'Podcast'}
                              {material.type === 'flashcards' && `Flashcards (${material.count})`}
                              {material.type === 'quiz' && `Quiz (${material.count} questions)`}
                            </Text>
                            <Text fontSize="xs" color="gray.500" _dark={{ color: "gray.400" }}>
                              {timeAgo}
                            </Text>
                          </VStack>
                          <IconButton
                            icon={<FiX />}
                            size="xs"
                            variant="ghost"
                            onClick={() => {
                              setSavedMaterials(savedMaterials.filter(m => m.id !== material.id));
                            }}
                            aria-label="Delete material"
                          />
                        </HStack>

                        {/* Podcast Player */}
                        {material.type === 'podcast' && (
                          <VStack gap={2} align="stretch">
                            <audio
                              controls
                              style={{ width: '100%', height: '32px' }}
                              src={material.audioUrl}
                            >
                              Your browser does not support the audio element.
                            </audio>
                            <Button
                              size="xs"
                              variant="ghost"
                              w="full"
                              onClick={() => {
                                setPodcastAudio(material.audioUrl);
                                setPodcastScript(material.script);
                                setShowPodcastPlayer(true);
                              }}
                              fontSize="xs"
                            >
                              View Transcript
                            </Button>
                          </VStack>
                        )}

                        {/* Flashcards Button */}
                        {material.type === 'flashcards' && (
                          <Button
                            size="sm"
                            w="full"
                            onClick={() => {
                              setStudioContent(material.data);
                              setStudioType('flashcards');
                              setCurrentFlashcardIndex(0);
                              setShowFlashcardAnswer(false);
                              setStudioModalOpen(true);
                            }}
                            colorScheme="blue"
                          >
                            Study Flashcards
                          </Button>
                        )}

                        {/* Quiz Button */}
                        {material.type === 'quiz' && (
                          <Button
                            size="sm"
                            w="full"
                            onClick={() => {
                              setStudioContent(material.data);
                              setStudioType('quiz');
                              setQuizAnswers({});
                              setShowQuizResults(false);
                              setStudioModalOpen(true);
                            }}
                            colorScheme="blue"
                          >
                            Take Quiz
                          </Button>
                        )}
                      </VStack>
                    </Box>
                  );
                })}
              </VStack>
            )}

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
                    bg="white"
                    _dark={{ bg: "black" }}
                    border="2px solid"
                    borderColor="black"
                    _dark={{ borderColor: "white" }}
                    borderRadius="lg"
                    minH="300px"
                    display="flex"
                    flexDirection="column"
                    justifyContent="center"
                    alignItems="center"
                    cursor="pointer"
                    onClick={() => setShowFlashcardAnswer(!showFlashcardAnswer)}
                    transition="all 0.2s ease"
                    _hover={{ boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)" }}
                  >
                    <VStack gap={6}>
                      <Text fontSize="xs" fontWeight="700" color="black" _dark={{ color: "white" }} letterSpacing="wider">
                        {showFlashcardAnswer ? 'ANSWER' : 'QUESTION'}
                      </Text>
                      <Text fontSize="xl" fontWeight="500" textAlign="center" lineHeight="1.6" color="black" _dark={{ color: "white" }}>
                        {showFlashcardAnswer
                          ? studioContent.flashcards[currentFlashcardIndex].answer
                          : studioContent.flashcards[currentFlashcardIndex].question}
                      </Text>
                      <Text fontSize="xs" color="gray.600" _dark={{ color: "gray.400" }}>
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

      {/* Podcast Player Modal */}
      {showPodcastPlayer && podcastAudio && (
        <>
          <Box
            position="fixed"
            top={0}
            left={0}
            right={0}
            bottom={0}
            bg="blackAlpha.700"
            zIndex={2000}
            onClick={() => setShowPodcastPlayer(false)}
          />
          <Box
            position="fixed"
            top="50%"
            left="50%"
            transform="translate(-50%, -50%)"
            bg="white"
            _dark={{ bg: "gray.800" }}
            borderRadius="2xl"
            boxShadow="2xl"
            zIndex={2001}
            maxW="600px"
            w="90%"
            maxH="80vh"
            overflow="hidden"
          >
            {/* Header */}
            <Flex
              px={6}
              py={4}
              borderBottom="1px solid"
              borderColor="gray.200"
              _dark={{ borderColor: "gray.700" }}
              justify="space-between"
              align="center"
            >
              <HStack gap={3}>
                <Text fontSize="2xl">🎙️</Text>
                <VStack align="start" gap={0}>
                  <Text fontSize="lg" fontWeight="700" color="gray.800" _dark={{ color: "gray.100" }}>
                    Study Podcast
                  </Text>
                  <Text fontSize="xs" color="gray.600" _dark={{ color: "gray.400" }}>
                    AI-generated audio summary
                  </Text>
                </VStack>
              </HStack>
              <IconButton
                icon={<FiX />}
                variant="ghost"
                size="sm"
                onClick={() => setShowPodcastPlayer(false)}
                aria-label="Close podcast player"
              />
            </Flex>

            {/* Audio Player */}
            <Box p={6}>
              <audio
                controls
                style={{ width: '100%', marginBottom: '16px' }}
                src={podcastAudio}
              >
                Your browser does not support the audio element.
              </audio>

              {/* Transcript */}
              {podcastScript && (
                <Box>
                  <Text fontSize="sm" fontWeight="600" color="gray.700" _dark={{ color: "gray.300" }} mb={2}>
                    Transcript:
                  </Text>
                  <Box
                    maxH="300px"
                    overflowY="auto"
                    p={4}
                    bg="gray.50"
                    _dark={{ bg: "gray.900" }}
                    borderRadius="md"
                    fontSize="sm"
                    lineHeight="1.8"
                    color="gray.700"
                    _dark={{ color: "gray.300" }}
                  >
                    {podcastScript}
                  </Box>
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

      {/* Upload Interface Overlay Modal */}
      {showUploadInterface && (
        <>
          {/* Backdrop */}
          <Box
            position="fixed"
            top={0}
            left={0}
            right={0}
            bottom={0}
            bg="blackAlpha.700"
            zIndex={2000}
            onClick={() => setShowUploadInterface(false)}
          />

          {/* Modal Content */}
          <Box
            position="fixed"
            top="50%"
            left="50%"
            transform="translate(-50%, -50%)"
            w="90%"
            maxW="600px"
            maxH="90vh"
            overflowY="auto"
            bg="white"
            _dark={{ bg: "gray.800" }}
            borderRadius="xl"
            boxShadow="2xl"
            zIndex={2001}
            p={6}
          >
            {/* Close Button */}
            <IconButton
              position="absolute"
              top={4}
              right={4}
              aria-label="Close"
              variant="ghost"
              size="sm"
              borderRadius="full"
              color="gray.900"
              _dark={{ color: "gray.100" }}
              _hover={{
                bg: "gray.100",
                _dark: { bg: "gray.700" }
              }}
              onClick={() => setShowUploadInterface(false)}
            >
              <FiX />
            </IconButton>

            {/* Upload Interface Content */}
            <VStack gap={6} w="full">
              <Heading size="lg" textAlign="center" pr={8}>
                Add Sources
              </Heading>

              {/* File Upload Card */}
              <Card.Root w="full" variant="outline">
                <Card.Body>
                  <VStack gap={4}>
                    <Box
                      cursor="pointer"
                      w="full"
                      p={8}
                      border="2px dashed"
                      borderColor={isDragging ? "blue.500" : (isUploading ? "blue.400" : "gray.300")}
                      _dark={{ borderColor: isDragging ? "blue.500" : (isUploading ? "blue.400" : "gray.600") }}
                      borderRadius="lg"
                      textAlign="center"
                      transition="all 0.2s"
                      bg={isDragging ? "blue.50" : "transparent"}
                      _dark={{ bg: isDragging ? "blue.900" : "transparent" }}
                      _hover={{
                        borderColor: "blue.400",
                        bg: "blue.50",
                        _dark: { bg: "blue.900" }
                      }}
                      opacity={isUploading ? 0.7 : 1}
                      onClick={() => {
                        if (!isUploading) {
                          document.getElementById('modal-file-upload')?.click();
                        }
                      }}
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
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
                      id="modal-file-upload"
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
            </VStack>
          </Box>
        </>
      )}

      {/* PDF Viewer Modal */}
      {pdfViewerVisible && currentPdfData && (
        <>
          <Box
            position="fixed"
            top={0}
            left={0}
            right={0}
            bottom={0}
            bg="blackAlpha.800"
            zIndex={3000}
            onClick={() => setPdfViewerVisible(false)}
          />
          <Box
            position="fixed"
            top="5%"
            left="5%"
            right="5%"
            bottom="5%"
            bg="white"
            _dark={{ bg: "gray.900" }}
            borderRadius="xl"
            boxShadow="2xl"
            zIndex={3001}
            overflow="hidden"
            display="flex"
            flexDirection="column"
          >
            {/* Header */}
            <Flex
              px={4}
              py={3}
              borderBottom="1px solid"
              borderColor="gray.200"
              _dark={{ borderColor: "gray.700" }}
              justify="space-between"
              align="center"
              bg="gray.50"
              _dark={{ bg: "gray.800" }}
            >
              <Text fontSize="md" fontWeight="600">
                PDF Viewer
              </Text>
              <IconButton
                icon={<FiX />}
                variant="ghost"
                size="sm"
                onClick={() => setPdfViewerVisible(false)}
                aria-label="Close PDF viewer"
              />
            </Flex>

            {/* PDF Viewer */}
            <Box flex={1} overflow="hidden">
              <PdfViewerWithHighlight
                pdfData={currentPdfData}
                pageNumber={currentPdfPage}
                highlightText={currentHighlightText}
              />
            </Box>
          </Box>
        </>
      )}

    </>
  );
}
