import { useRouter } from "next/router";
import Image from "next/image";
import { Box, Button, Container, Flex, HStack, Spacer } from "@chakra-ui/react";
import { useAuth } from "@/contexts/AuthContext";
import UserButton from "@/components/UserButton";

export default function NavBar() {
  const router = useRouter();
  const { user, loading } = useAuth();

  return (
    <Box
      position="sticky"
      top={0}
      zIndex={100}
      bg="white"
      _dark={{ bg: "gray.950" }}
      borderBottom="1px solid"
      borderColor="gray.100"
      _dark={{ borderColor: "gray.800" }}
    >
      <Container maxW="6xl">
        <Flex py={4} align="center">
          <Box cursor="pointer" onClick={() => router.push("/")}>
            <Image
              src="/logo.png"
              alt="Researchella"
              width={140}
              height={40}
              style={{ objectFit: "contain" }}
            />
          </Box>
          <Spacer />
          {!user && !loading && (
            <HStack gap={3}>
              <Button
                variant="ghost"
                size="sm"
                color="gray.600"
                _dark={{ color: "gray.400" }}
                onClick={() => router.push("/auth/sign-in")}
              >
                Sign in
              </Button>
              <Button
                size="sm"
                bg="gray.900"
                color="white"
                _dark={{ bg: "white", color: "gray.900" }}
                _hover={{
                  bg: "gray.800",
                  _dark: { bg: "gray.100" },
                }}
                onClick={() => router.push("/auth/sign-up")}
              >
                Sign up
              </Button>
            </HStack>
          )}
          {user && <UserButton afterSignOutUrl="/" />}
        </Flex>
      </Container>
    </Box>
  );
}
