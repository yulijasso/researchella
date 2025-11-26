import Head from "next/head";
import { useRouter } from "next/router";
import Image from "next/image";
import { Box, Button, Heading, Text, VStack, HStack } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { useAuth } from "@/contexts/AuthContext";
import UserButton from "@/components/UserButton";

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  return (
    <>
      <Head>
        <title>Researchella - Your Research Festival</title>
        <meta name="description" content="Turn your research into conversations" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link href="https://fonts.googleapis.com/css2?family=Righteous&family=Kalam:wght@400;700&display=swap" rel="stylesheet" />
        <style>{`
          @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(5deg); }
          }

          @keyframes bounce {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
          }

          .hand-drawn-bg {
            background:
              /* Subtle halftone dots */
              radial-gradient(circle, rgba(0, 0, 0, 0.03) 1px, transparent 1px),
              radial-gradient(circle, rgba(0, 0, 0, 0.03) 1px, transparent 1px),
              /* Newspaper texture grain */
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
              /* Base aged newspaper color */
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
            position: relative;
            overflow: hidden;
          }

          .retro-outlined-text {
            font-family: 'Righteous', cursive;
            color: #BF572A;
            -webkit-text-stroke: 3px #8B3A1A;
            paint-order: stroke fill;
            text-shadow:
              4px 4px 0px rgba(139, 58, 26, 0.3),
              8px 8px 0px rgba(139, 58, 26, 0.15);
            letter-spacing: 0.02em;
          }

          .hand-drawn-border {
            border: none;
            border-radius: 0px;
            background: transparent;
            box-shadow: none;
          }

          .retro-button {
            border: 4px solid #8B3A1A;
            border-radius: 50px;
            background: #BF572A;
            color: #FFF4E6;
            font-family: 'Righteous', cursive;
            box-shadow:
              4px 4px 0px #8B3A1A;
            transition: all 0.2s;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }

          .retro-button:hover {
            transform: translate(2px, 2px);
            box-shadow: 2px 2px 0px #8B3A1A;
          }

          .retro-button-outline {
            border: 4px solid #8B3A1A;
            border-radius: 50px;
            background: transparent;
            color: #8B3A1A;
            font-family: 'Righteous', cursive;
            box-shadow:
              4px 4px 0px rgba(139, 58, 26, 0.3);
            transition: all 0.2s;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }

          .retro-button-outline:hover {
            transform: translate(2px, 2px);
            box-shadow: 2px 2px 0px rgba(139, 58, 26, 0.3);
            background: rgba(139, 58, 26, 0.05);
          }
        `}</style>
      </Head>

      <Box
        className="hand-drawn-bg"
        minH="100vh"
        w="100vw"
        position="relative"
        overflow="hidden"
        display="flex"
        alignItems="center"
        justifyContent="center"
        p={8}
      >
        {/* User button if logged in */}
        {user && (
          <Box position="absolute" top={4} right={6} zIndex={10}>
            <UserButton afterSignOutUrl="/" />
          </Box>
        )}

        <Box
          className="hand-drawn-border"
          maxW="1200px"
          w="full"
          p={{ base: 8, md: 12, lg: 16 }}
          position="relative"
          sx={{ animation: `${fadeIn} 1s ease-out` }}
        >
          <VStack spacing={1} align="center" textAlign="center">
            {/* Logo */}
            <Box mb={-4}>
              <Image
                src="/logo.png"
                alt="Researchella"
                width={360}
                height={120}
                style={{ objectFit: "contain" }}
              />
            </Box>

            {/* Main content */}
            <VStack gap={4} align="center" textAlign="center">
              <Heading
                className="retro-outlined-text"
                size={{ base: "3xl", md: "4xl", lg: "5xl" }}
                fontWeight="900"
                lineHeight="1.1"
                textTransform="uppercase"
              >
                Your research
                <br />
                festival starts here
              </Heading>

              <Text
                fontSize={{ base: "lg", md: "xl" }}
                fontFamily="'Kalam', cursive"
                color="#8B3A1A"
                maxW="2xl"
                lineHeight="1.6"
                fontWeight="400"
              >
                Upload papers, ask questions, get instant AI-powered insights with accurate citations
              </Text>
            </VStack>

            {/* CTA Buttons */}
            <HStack gap={4} pt={4}>
              {!user && !loading && (
                <>
                  <Button
                    onClick={() => router.push('/auth/sign-up')}
                    className="retro-button"
                    size="lg"
                    h="56px"
                    px={10}
                    fontSize="md"
                  >
                    Start Now
                  </Button>
                  <Button
                    onClick={() => router.push('/auth/sign-in')}
                    className="retro-button-outline"
                    size="lg"
                    h="56px"
                    px={10}
                    fontSize="md"
                  >
                    Sign In
                  </Button>
                </>
              )}

              {user && (
                <Button
                  onClick={() => router.push("/sessions")}
                  className="retro-button"
                  size="lg"
                  h="56px"
                  px={10}
                  fontSize="md"
                >
                  Go to Dashboard
                </Button>
              )}
            </HStack>
          </VStack>
        </Box>
      </Box>
    </>
  );
}
