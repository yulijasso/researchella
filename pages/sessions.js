import Head from "next/head";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Image from "next/image";
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
  Input,
  Icon,
  SimpleGrid,
} from "@chakra-ui/react";
import { FiPlus, FiMessageSquare, FiTrash2, FiArrowRight, FiFile, FiClock, FiAlertCircle, FiHome } from "react-icons/fi";
import { toaster } from "@/components/ui/toaster";
import { useAuth } from "@/contexts/AuthContext";
import UserButton from "@/components/UserButton";
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  DialogActionTrigger,
} from "@/components/ui/dialog";

export default function Sessions() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const isLoaded = !loading;
  const [sessions, setSessions] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [sessionToDelete, setSessionToDelete] = useState(null);

  useEffect(() => {
    if (!isLoaded || !user) return;

    const fetchSessions = async () => {
      try {
        const response = await fetch('/api/sessions');
        if (!response.ok) throw new Error('Failed to fetch sessions');

        const { sessions: fetchedSessions } = await response.json();
        setSessions(fetchedSessions || []);
      } catch (error) {
        console.error('Error fetching sessions:', error);
        toaster.create({
          title: "Error Loading Sessions",
          description: "Failed to load your chat sessions. Please refresh the page.",
          status: "error",
          duration: 5000,
        });
      }
    };

    fetchSessions();
  }, [isLoaded, user]);

  const createNewSession = async () => {
    if (!newSessionName.trim()) {
      toaster.create({
        title: "Session name required",
        description: "Please enter a name for your chat session",
        status: "error",
        duration: 3000,
      });
      return;
    }

    try {
      const newSession = {
        id: Date.now().toString(),
        name: newSessionName.trim(),
      };

      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSession),
      });

      if (!response.ok) throw new Error('Failed to create session');

      const { session } = await response.json();
      setSessions([session, ...sessions]);
      setNewSessionName("");
      setIsCreating(false);

      toaster.create({
        title: "Session Created",
        description: `"${session.name}" is ready`,
        status: "success",
        duration: 2000,
      });

      router.push(`/chat?session=${session.id}`);
    } catch (error) {
      console.error('Error creating session:', error);
      toaster.create({
        title: "Error",
        description: "Failed to create session. Please try again.",
        status: "error",
        duration: 3000,
      });
    }
  };

  const confirmDelete = (sessionId, sessionName) => {
    setSessionToDelete({ id: sessionId, name: sessionName });
  };

  const deleteSession = async () => {
    if (!sessionToDelete) return;

    try {
      const response = await fetch('/api/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionToDelete.id }),
      });

      if (!response.ok) throw new Error('Failed to delete session');

      try {
        await fetch('/api/delete-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionToDelete.id }),
        });
      } catch (error) {
        console.error('Error deleting from vector database:', error);
      }

      setSessions(sessions.filter((s) => s.id !== sessionToDelete.id));

      toaster.create({
        title: "Session Deleted",
        description: `"${sessionToDelete.name}" has been removed`,
        status: "success",
        duration: 3000,
      });

      setSessionToDelete(null);
    } catch (error) {
      console.error('Error deleting session:', error);
      toaster.create({
        title: "Error",
        description: "Failed to delete session. Please try again.",
        status: "error",
        duration: 3000,
      });
      setSessionToDelete(null);
    }
  };

  const openSession = (sessionId) => {
    router.push(`/chat?session=${sessionId}`);
  };

  return (
    <>
      <Head>
        <title>Dashboard - PaperSage</title>
        <meta name="description" content="Manage your research sessions" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <Box minH="100vh" bg="white" position="relative" overflow="hidden">
        {/* Gradient Background */}
        <Box
          position="absolute"
          inset={0}
          bgGradient="linear(to-br, white 0%, teal.50 40%, teal.100 100%)"
        />

        {/* Glow Effects */}
        <Box
          position="absolute"
          top="10%"
          right="20%"
          w="40%"
          h="40%"
          bg="teal.200"
          filter="blur(180px)"
          opacity={0.3}
          borderRadius="full"
        />

        {/* Content */}
        <Box position="relative" zIndex={1}>
          {/* Header */}
          <Flex
            px={6}
            py={4}
            align="center"
            gap={4}
            borderBottom="1px solid"
            borderColor="gray.200"
          >
            <Box cursor="pointer" onClick={() => router.push('/')}>
              <Image src="/logo.png" alt="PaperSage" width={120} height={35} style={{ objectFit: "contain" }} />
            </Box>
            <Box
              px={3}
              py={1}
              bg="teal.50"
              borderRadius="full"
              border="1px solid"
              borderColor="teal.200"
            >
              <Text fontSize="xs" color="teal.700" fontWeight="500">Dashboard</Text>
            </Box>
            <Box flex={1} />
            <IconButton
              icon={<FiHome />}
              variant="ghost"
              color="gray.500"
              _hover={{ color: "gray.800", bg: "gray.100" }}
              onClick={() => router.push('/')}
              aria-label="Home"
            />
            <UserButton afterSignOutUrl="/" />
          </Flex>

          {/* Main Content */}
          <Container maxW="5xl" py={12}>
            <VStack gap={10} align="stretch">
              {/* Header Section */}
              <VStack gap={3} align="start">
                <Heading size="2xl" color="gray.800" fontWeight="700">
                  Your Sessions
                </Heading>
                <Text color="gray.600" fontSize="lg">
                  Create and manage your research conversations
                </Text>
              </VStack>

              {/* Create New Session */}
              {!isCreating ? (
                <Button
                  leftIcon={<FiPlus />}
                  size="lg"
                  h="64px"
                  fontSize="md"
                  fontWeight="600"
                  bg="teal.600"
                  color="white"
                  borderRadius="xl"
                  _hover={{
                    bg: "teal.500",
                    transform: "translateY(-2px)",
                    shadow: "0 10px 40px rgba(20, 184, 166, 0.3)",
                  }}
                  _active={{ transform: "translateY(0)" }}
                  transition="all 0.2s"
                  onClick={() => setIsCreating(true)}
                >
                  Create New Session
                </Button>
              ) : (
                <Box
                  p={6}
                  bg="white"
                  borderRadius="2xl"
                  border="1px solid"
                  borderColor="gray.200"
                  shadow="sm"
                >
                  <VStack gap={4} align="stretch">
                    <Heading size="md" color="gray.800">New Session</Heading>
                    <Input
                      placeholder="e.g., Machine Learning Papers, Thesis Research..."
                      value={newSessionName}
                      onChange={(e) => setNewSessionName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") createNewSession();
                        if (e.key === "Escape") {
                          setIsCreating(false);
                          setNewSessionName("");
                        }
                      }}
                      size="lg"
                      bg="gray.50"
                      border="1px solid"
                      borderColor="gray.200"
                      color="gray.800"
                      _placeholder={{ color: "gray.400" }}
                      _focus={{ borderColor: "teal.500", boxShadow: "0 0 0 1px var(--chakra-colors-teal-500)" }}
                      borderRadius="xl"
                      autoFocus
                    />
                    <HStack gap={3}>
                      <Button
                        bg="teal.600"
                        color="white"
                        _hover={{ bg: "teal.500" }}
                        onClick={createNewSession}
                        flex={1}
                        borderRadius="xl"
                      >
                        Create
                      </Button>
                      <Button
                        variant="ghost"
                        color="gray.600"
                        _hover={{ color: "gray.800", bg: "gray.100" }}
                        onClick={() => {
                          setIsCreating(false);
                          setNewSessionName("");
                        }}
                        flex={1}
                        borderRadius="xl"
                      >
                        Cancel
                      </Button>
                    </HStack>
                  </VStack>
                </Box>
              )}

              {/* Sessions List */}
              {sessions.length === 0 ? (
                <Box
                  p={16}
                  textAlign="center"
                  borderRadius="2xl"
                  border="2px dashed"
                  borderColor="whiteAlpha.200"
                  bg="whiteAlpha.50"
                >
                  <VStack gap={4}>
                    <Box
                      p={4}
                      bg="whiteAlpha.100"
                      borderRadius="full"
                    >
                      <Icon as={FiMessageSquare} boxSize={10} color="gray.500" />
                    </Box>
                    <VStack gap={1}>
                      <Text color="gray.300" fontWeight="500" fontSize="lg">
                        No sessions yet
                      </Text>
                      <Text color="gray.500">
                        Create your first session to get started
                      </Text>
                    </VStack>
                  </VStack>
                </Box>
              ) : (
                <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
                  {sessions.map((session) => (
                    <Box
                      key={session.id}
                      p={5}
                      bg="whiteAlpha.50"
                      borderRadius="2xl"
                      border="1px solid"
                      borderColor="whiteAlpha.100"
                      cursor="pointer"
                      transition="all 0.3s"
                      _hover={{
                        bg: "whiteAlpha.100",
                        borderColor: "teal.500",
                        transform: "translateY(-4px)",
                        shadow: "0 10px 40px rgba(0,0,0,0.3)",
                      }}
                      onClick={() => openSession(session.id)}
                    >
                      <Flex direction="column" gap={4}>
                        <Flex align="start" justify="space-between">
                          <HStack gap={3}>
                            <Box
                              p={2.5}
                              bgGradient="linear(to-br, teal.400, teal.600)"
                              borderRadius="lg"
                            >
                              <Icon as={FiMessageSquare} boxSize={5} color="white" />
                            </Box>
                            <VStack align="start" gap={0}>
                              <Text fontWeight="600" color="white" fontSize="lg" noOfLines={1}>
                                {session.name}
                              </Text>
                              <HStack gap={3} fontSize="xs" color="gray.500">
                                <HStack gap={1}>
                                  <FiClock size={12} />
                                  <Text>{new Date(session.createdAt).toLocaleDateString()}</Text>
                                </HStack>
                                <HStack gap={1}>
                                  <FiMessageSquare size={12} />
                                  <Text>{session.messageCount || 0}</Text>
                                </HStack>
                              </HStack>
                            </VStack>
                          </HStack>
                          <HStack gap={1}>
                            <IconButton
                              icon={<FiArrowRight />}
                              size="sm"
                              variant="ghost"
                              color="gray.400"
                              _hover={{ color: "teal.400", bg: "whiteAlpha.100" }}
                              aria-label="Open"
                              onClick={(e) => {
                                e.stopPropagation();
                                openSession(session.id);
                              }}
                            />
                            <IconButton
                              icon={<FiTrash2 />}
                              size="sm"
                              variant="ghost"
                              color="gray.500"
                              _hover={{ color: "red.400", bg: "whiteAlpha.100" }}
                              aria-label="Delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmDelete(session.id, session.name);
                              }}
                            />
                          </HStack>
                        </Flex>

                        {session.uploadedFiles && session.uploadedFiles.length > 0 && (
                          <Box
                            p={3}
                            bg="whiteAlpha.50"
                            borderRadius="lg"
                          >
                            <VStack align="start" gap={2}>
                              {session.uploadedFiles.slice(0, 2).map((file, idx) => (
                                <HStack key={idx} gap={2} fontSize="xs" color="gray.400">
                                  <FiFile size={12} />
                                  <Text noOfLines={1}>{file.name}</Text>
                                </HStack>
                              ))}
                              {session.uploadedFiles.length > 2 && (
                                <Text fontSize="xs" color="teal.400" fontWeight="500">
                                  +{session.uploadedFiles.length - 2} more
                                </Text>
                              )}
                            </VStack>
                          </Box>
                        )}
                      </Flex>
                    </Box>
                  ))}
                </SimpleGrid>
              )}
            </VStack>
          </Container>
        </Box>
      </Box>

      {/* Delete Confirmation Dialog */}
      <DialogRoot
        open={!!sessionToDelete}
        onOpenChange={(e) => {
          if (!e.open) setSessionToDelete(null);
        }}
      >
        <DialogContent bg="gray.900" borderColor="whiteAlpha.200">
          <DialogHeader>
            <DialogTitle color="white">Delete Session</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <VStack gap={3} align="start">
              <HStack gap={2} color="orange.400">
                <FiAlertCircle size={20} />
                <Text fontWeight="600">Are you sure?</Text>
              </HStack>
              <Text color="gray.300">
                You're about to delete <strong>"{sessionToDelete?.name}"</strong>.
                This will permanently remove all messages and files.
              </Text>
              <Text fontSize="sm" color="gray.500">
                This action cannot be undone.
              </Text>
            </VStack>
          </DialogBody>
          <DialogFooter>
            <DialogActionTrigger asChild>
              <Button
                variant="outline"
                borderColor="whiteAlpha.200"
                color="gray.300"
                _hover={{ bg: "whiteAlpha.100" }}
                onClick={() => setSessionToDelete(null)}
              >
                Cancel
              </Button>
            </DialogActionTrigger>
            <Button
              bg="red.600"
              color="white"
              _hover={{ bg: "red.500" }}
              onClick={deleteSession}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </>
  );
}
