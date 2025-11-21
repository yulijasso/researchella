import Head from 'next/head';
import { SignIn } from '@clerk/nextjs';
import { Box, Container, Heading, Text, VStack } from '@chakra-ui/react';

export default function SignInPage() {
  return (
    <>
      <Head>
        <title>Sign In - PaperSage</title>
        <meta name="description" content="Sign in to PaperSage" />
      </Head>

      <Box
        minH="100vh"
        bg="gray.50"
        _dark={{ bg: 'gray.900' }}
        display="flex"
        alignItems="center"
        justifyContent="center"
        py={12}
      >
        <Container maxW="md">
          <VStack gap={8} align="stretch">
            {/* Header */}
            <VStack gap={2} textAlign="center">
              <Heading size="2xl" color="blue.500">
                PaperSage
              </Heading>
              <Text color="gray.600" _dark={{ color: 'gray.400' }} fontSize="lg">
                Your AI Research Assistant
              </Text>
            </VStack>

            {/* Clerk Sign In Component */}
            <Box
              display="flex"
              justifyContent="center"
              alignItems="center"
            >
              <SignIn
                appearance={{
                  elements: {
                    rootBox: "mx-auto",
                    card: "shadow-lg",
                  },
                }}
                routing="path"
                path="/auth/sign-in"
                redirectUrl="/sessions"
                signUpUrl="/auth/sign-up"
              />
            </Box>

            <Text fontSize="sm" color="gray.500" textAlign="center">
              Upload PDFs, ask questions, and get AI-powered insights from your research papers.
            </Text>
          </VStack>
        </Container>
      </Box>
    </>
  );
}
