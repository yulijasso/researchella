import Head from "next/head";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  IconButton,
  Text,
  VStack,
  Spinner,
} from "@chakra-ui/react";
import { FiArrowLeft, FiSun, FiMoon } from "react-icons/fi";
import { useColorMode } from "@/components/ui/color-mode";

export default function DocumentViewer() {
  const router = useRouter();
  const { id, highlight } = router.query;
  const { colorMode, toggleColorMode } = useColorMode();
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      // Load document from localStorage
      const docs = JSON.parse(localStorage.getItem("documents") || "{}");
      const doc = docs[id];
      if (doc) {
        setDocument(doc);
      }
      setLoading(false);

      // Scroll to highlighted text after a short delay
      if (highlight) {
        setTimeout(() => {
          const element = document.getElementById(`highlight-${highlight}`);
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 100);
      }
    }
  }, [id, highlight]);

  const highlightText = (text, highlightStr) => {
    if (!highlightStr) return text;

    const parts = text.split(new RegExp(`(${escapeRegex(highlightStr)})`, "gi"));
    return parts.map((part, index) => {
      if (part.toLowerCase() === highlightStr.toLowerCase()) {
        return (
          <mark
            key={index}
            id={`highlight-${index}`}
            style={{
              backgroundColor: "yellow",
              padding: "2px 0",
              fontWeight: "bold",
            }}
          >
            {part}
          </mark>
        );
      }
      return part;
    });
  };

  const escapeRegex = (str) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  };

  if (loading) {
    return (
      <Flex h="100vh" align="center" justify="center">
        <Spinner size="xl" />
      </Flex>
    );
  }

  if (!document) {
    return (
      <Flex h="100vh" align="center" justify="center">
        <VStack gap={4}>
          <Text fontSize="xl">Document not found</Text>
          <Button onClick={() => router.back()}>Go Back</Button>
        </VStack>
      </Flex>
    );
  }

  return (
    <>
      <Head>
        <title>{document.name} - PaperSage</title>
        <meta name="description" content="Document viewer" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <Flex minH="100vh" direction="column" bg="gray.50" _dark={{ bg: "gray.900" }}>
        {/* Header */}
        <Flex
          px={6}
          py={4}
          bg="white"
          _dark={{ bg: "gray.800" }}
          borderBottom="1px solid"
          borderColor="gray.200"
          _dark={{ borderColor: "gray.700" }}
          align="center"
          gap={4}
        >
          <IconButton
            icon={<FiArrowLeft />}
            variant="ghost"
            onClick={() => router.back()}
            aria-label="Go back"
          />
          <Heading size="md" flex={1} noOfLines={1}>
            {document.name}
          </Heading>
          {document.page && (
            <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }}>
              Page {document.page}
            </Text>
          )}
          <IconButton
            icon={colorMode === "light" ? <FiMoon /> : <FiSun />}
            variant="ghost"
            onClick={toggleColorMode}
            aria-label="Toggle color mode"
          />
        </Flex>

        {/* Document Content */}
        <Container maxW="4xl" py={8} flex={1}>
          <Box
            bg="white"
            _dark={{ bg: "gray.800" }}
            p={8}
            borderRadius="lg"
            boxShadow="md"
          >
            <Text
              fontSize="md"
              lineHeight="1.8"
              whiteSpace="pre-wrap"
              fontFamily="serif"
            >
              {highlightText(document.content, highlight)}
            </Text>
          </Box>
        </Container>
      </Flex>
    </>
  );
}
