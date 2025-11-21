import Head from "next/head";
import { useRouter } from "next/router";
import Image from "next/image";
import { Box, Button, Heading, Text, VStack, HStack, Container, Flex, Icon, SimpleGrid } from "@chakra-ui/react";
import { FiArrowRight, FiUpload, FiMessageCircle, FiBookOpen, FiZap, FiShield, FiGlobe } from "react-icons/fi";
import { useAuth } from "@/contexts/AuthContext";
import UserButton from "@/components/UserButton";

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  return (
    <>
      <Head>
        <title>PaperSage - AI Research Assistant</title>
        <meta name="description" content="Turn your research into conversations" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Box minH="100vh" bg="white" position="relative" overflow="hidden">
        {/* Gradient Background - White to Sage */}
        <Box
          position="absolute"
          inset={0}
          bgGradient="linear(to-br, white 0%, teal.50 40%, teal.100 100%)"
        />

        {/* Soft Glow Effects */}
        <Box
          position="absolute"
          top="-10%"
          right="-5%"
          w="50%"
          h="50%"
          bg="teal.200"
          filter="blur(150px)"
          opacity={0.3}
          borderRadius="full"
        />
        <Box
          position="absolute"
          bottom="-5%"
          left="-5%"
          w="35%"
          h="35%"
          bg="teal.300"
          filter="blur(120px)"
          opacity={0.2}
          borderRadius="full"
        />

        {/* Content */}
        <Box position="relative" zIndex={1}>
          {/* Simple Header with Logo */}
          <Flex px={6} py={4} align="center" justify="space-between">
            <Image src="/logo.png" alt="PaperSage" width={140} height={40} style={{ objectFit: "contain" }} />
            <HStack gap={3}>
              {!user && !loading && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    color="gray.600"
                    _hover={{ color: "gray.900" }}
                    onClick={() => router.push("/auth/sign-in")}
                  >
                    Sign in
                  </Button>
                  <Button
                    size="sm"
                    bg="teal.600"
                    color="white"
                    _hover={{ bg: "teal.700" }}
                    onClick={() => router.push("/auth/sign-up")}
                  >
                    Sign up
                  </Button>
                </>
              )}
              {user && <UserButton afterSignOutUrl="/" />}
            </HStack>
          </Flex>

          {/* Hero Section */}
          <Container maxW="6xl" centerContent>
            <VStack
              gap={8}
              align="center"
              textAlign="center"
              w="full"
              pt={{ base: 20, md: 28 }}
              pb={{ base: 16, md: 24 }}
            >
              {/* Badge */}
              <Box
                px={4}
                py={2}
                bg="white"
                borderRadius="full"
                border="1px solid"
                borderColor="gray.200"
                shadow="sm"
              >
                <HStack gap={2}>
                  <Box w={2} h={2} bg="teal.500" borderRadius="full" />
                  <Text fontSize="sm" color="gray.600" fontWeight="500">
                    Powered by GPT-4 & RAG
                  </Text>
                </HStack>
              </Box>

              {/* Main Heading */}
              <VStack gap={6} maxW="4xl" align="center" textAlign="center">
                <Heading
                  size={{ base: "3xl", md: "4xl", lg: "5xl" }}
                  fontWeight="700"
                  letterSpacing="-0.03em"
                  lineHeight="1.1"
                  color="gray.800"
                  textAlign="center"
                >
                  Turn your research
                  <br />
                  <Text as="span" bgGradient="linear(to-r, teal.500, teal.700)" bgClip="text">
                    into conversations
                  </Text>
                </Heading>

                <Text
                  fontSize={{ base: "lg", md: "xl" }}
                  color="gray.600"
                  maxW="2xl"
                  lineHeight="1.7"
                  textAlign="center"
                >
                  Upload papers, ask questions, get instant AI-powered insights
                  with accurate citations. Your intelligent research companion.
                </Text>
              </VStack>

              {/* CTA Buttons */}
              <HStack gap={4} pt={4}>
                {!user && !loading && (
                  <>
                    <Button
                      onClick={() => router.push('/auth/sign-up')}
                      size="lg"
                      h="56px"
                      px={8}
                      fontSize="md"
                      fontWeight="600"
                      bg="teal.600"
                      color="white"
                      borderRadius="xl"
                      rightIcon={<FiArrowRight />}
                      _hover={{
                        transform: "translateY(-2px)",
                        shadow: "0 20px 40px rgba(20, 184, 166, 0.3)",
                        bg: "teal.700",
                      }}
                      _active={{ transform: "translateY(0)" }}
                      transition="all 0.2s"
                    >
                      Get started free
                    </Button>
                    <Button
                      onClick={() => router.push('/auth/sign-in')}
                      size="lg"
                      h="56px"
                      px={8}
                      fontSize="md"
                      fontWeight="500"
                      bg="white"
                      color="gray.700"
                      borderRadius="xl"
                      border="1px solid"
                      borderColor="gray.200"
                      _hover={{
                        bg: "gray.50",
                        borderColor: "gray.300",
                      }}
                      transition="all 0.2s"
                    >
                      Sign in
                    </Button>
                  </>
                )}

                {user && (
                  <Button
                    onClick={() => router.push("/sessions")}
                    size="lg"
                    h="56px"
                    px={8}
                    fontSize="md"
                    fontWeight="600"
                    bg="teal.600"
                    color="white"
                    borderRadius="xl"
                    rightIcon={<FiArrowRight />}
                    _hover={{
                      transform: "translateY(-2px)",
                      shadow: "0 20px 40px rgba(20, 184, 166, 0.3)",
                      bg: "teal.700",
                    }}
                    _active={{ transform: "translateY(0)" }}
                    transition="all 0.2s"
                  >
                    Go to dashboard
                  </Button>
                )}
              </HStack>

              {/* Feature Pills */}
              <HStack
                gap={4}
                pt={6}
                flexWrap="wrap"
                justify="center"
              >
                {["PDF & Images", "Instant Citations", "Multi-Session"].map((feature) => (
                  <Box
                    key={feature}
                    px={4}
                    py={2}
                    bg="white"
                    borderRadius="full"
                    border="1px solid"
                    borderColor="gray.200"
                  >
                    <Text fontSize="sm" color="gray.600">
                      {feature}
                    </Text>
                  </Box>
                ))}
              </HStack>
            </VStack>
          </Container>

          {/* Features Section */}
          <Box py={{ base: 16, md: 24 }}>
            <Container maxW="6xl">
              <VStack gap={16}>
                {/* Section Header */}
                <VStack gap={4} textAlign="center">
                  <Text
                    fontSize="sm"
                    fontWeight="600"
                    color="teal.400"
                    textTransform="uppercase"
                    letterSpacing="0.1em"
                  >
                    Features
                  </Text>
                  <Heading size="2xl" color="gray.800" fontWeight="600">
                    Everything you need for research
                  </Heading>
                </VStack>

                {/* Feature Grid */}
                <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={6} w="full">
                  <FeatureCard
                    icon={FiUpload}
                    title="Smart Upload"
                    description="Drag and drop PDFs, images, or documents. Our AI extracts and indexes everything automatically."
                  />
                  <FeatureCard
                    icon={FiMessageCircle}
                    title="Natural Chat"
                    description="Ask questions in plain English. Get detailed answers with precise citations to your sources."
                  />
                  <FeatureCard
                    icon={FiBookOpen}
                    title="Deep Analysis"
                    description="Understand complex papers instantly. Our AI breaks down concepts and explains them clearly."
                  />
                  <FeatureCard
                    icon={FiZap}
                    title="Lightning Fast"
                    description="Get answers in seconds, not hours. Powered by advanced RAG and GPT-4 technology."
                  />
                  <FeatureCard
                    icon={FiShield}
                    title="Secure & Private"
                    description="Your documents stay private. Session isolation ensures your research remains confidential."
                  />
                  <FeatureCard
                    icon={FiGlobe}
                    title="Multi-Format"
                    description="Works with PDFs, images, screenshots, and more. GPT-4 Vision handles it all."
                  />
                </SimpleGrid>
              </VStack>
            </Container>
          </Box>

          {/* Footer */}
          <Container maxW="6xl" py={12}>
            <Flex
              direction={{ base: "column", md: "row" }}
              gap={4}
              align="center"
              justify="space-between"
              borderTop="1px solid"
              borderColor="gray.200"
              pt={8}
            >
              <Image src="/logo.png" alt="PaperSage" width={120} height={35} style={{ objectFit: "contain" }} />
              <Text color="gray.600" fontSize="sm">
                © 2025 PaperSage. AI Research Assistant.
              </Text>
              <HStack gap={6}>
                <Text color="gray.600" fontSize="sm" cursor="pointer" _hover={{ color: "gray.900" }}>
                  Privacy
                </Text>
                <Text color="gray.600" fontSize="sm" cursor="pointer" _hover={{ color: "gray.900" }}>
                  Terms
                </Text>
              </HStack>
            </Flex>
          </Container>
        </Box>
      </Box>
    </>
  );
}

function FeatureCard({ icon, title, description }) {
  return (
    <Box
      p={6}
      bg="white"
      borderRadius="2xl"
      border="1px solid"
      borderColor="gray.200"
      transition="all 0.3s"
      shadow="sm"
      _hover={{
        bg: "white",
        borderColor: "teal.400",
        transform: "translateY(-4px)",
        shadow: "lg",
      }}
    >
      <VStack align="start" gap={4}>
        <Box
          p={3}
          bg="teal.500"
          bgGradient="linear(to-br, teal.400, teal.600)"
          borderRadius="xl"
        >
          <Icon as={icon} boxSize={6} color="white" />
        </Box>
        <VStack align="start" gap={2}>
          <Heading size="md" fontWeight="600" color="gray.800">
            {title}
          </Heading>
          <Text fontSize="sm" color="gray.600" lineHeight="1.7">
            {description}
          </Text>
        </VStack>
      </VStack>
    </Box>
  );
}
