import Head from "next/head";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Image from "next/image";
import {
  Box,
  Button,
  Flex,
  Heading,
  IconButton,
  Text,
  VStack,
  HStack,
  Input,
  Icon,
  Grid,
} from "@chakra-ui/react";
import { FiPlus, FiMessageSquare, FiTrash2, FiArrowRight, FiFile, FiClock, FiAlertCircle, FiHome, FiEdit2, FiCheck, FiX, FiSun, FiMoon } from "react-icons/fi";
import { useColorMode } from "@/components/ui/color-mode";
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

const formatDate = (dateValue) => {
  if (!dateValue) return "No date";
  const date = new Date(dateValue);
  if (isNaN(date.getTime())) {
    const timestamp = parseInt(dateValue);
    if (!isNaN(timestamp) && timestamp > 1000000000000) {
      return new Date(timestamp).toLocaleDateString();
    }
    return "No date";
  }
  return date.toLocaleDateString();
};

export default function Sessions() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { colorMode, toggleColorMode } = useColorMode();
  const isLoaded = !loading;
  const [sessions, setSessions] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [editingSession, setEditingSession] = useState(null);
  const [editName, setEditName] = useState("");

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
          type: "error",
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
        type: "error",
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
        type: "success",
        duration: 2000,
      });

      router.push(`/chat?session=${session.id}`);
    } catch (error) {
      console.error('Error creating session:', error);
      toaster.create({
        title: "Error",
        description: "Failed to create session. Please try again.",
        type: "error",
        duration: 3000,
      });
    }
  };

  const startEditing = (session, e) => {
    e.stopPropagation();
    setEditingSession(session.id);
    setEditName(session.name);
  };

  const cancelEditing = (e) => {
    if (e) e.stopPropagation();
    setEditingSession(null);
    setEditName("");
  };

  const saveSessionName = async (sessionId, e) => {
    if (e) e.stopPropagation();

    if (!editName.trim()) {
      cancelEditing();
      return;
    }

    try {
      const response = await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, name: editName.trim() }),
      });

      if (!response.ok) throw new Error('Failed to rename session');

      setSessions(sessions.map(s =>
        s.id === sessionId ? { ...s, name: editName.trim() } : s
      ));

      toaster.create({
        title: "Renamed",
        description: "Notebook renamed successfully",
        type: "success",
        duration: 2000,
      });

      setEditingSession(null);
      setEditName("");
    } catch (error) {
      console.error('Error renaming session:', error);
      toaster.create({
        title: "Error",
        description: "Failed to rename. Please try again.",
        type: "error",
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
        type: "success",
        duration: 3000,
      });

      setSessionToDelete(null);
    } catch (error) {
      console.error('Error deleting session:', error);
      toaster.create({
        title: "Error",
        description: "Failed to delete session. Please try again.",
        type: "error",
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
        <title>Dashboard - Researchella</title>
        <meta name="description" content="Manage your research sessions" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <Box bg="white" _dark={{ bg: "gray.900" }} minH="100vh">
        {/* Header */}
        <Flex
          px={6}
          py={4}
          align="center"
          gap={4}
          borderBottom="1px solid"
          borderColor="gray.200"
          _dark={{ borderColor: "gray.700" }}
        >
          <Box cursor="pointer" onClick={() => router.push('/')}>
            <Image src="/logo.png" alt="Researchella" width={120} height={35} style={{ objectFit: "contain" }} />
          </Box>
          <Text fontSize="sm" color="gray.500" fontWeight="500">
            Dashboard
          </Text>
          <Box flex={1} />
          <HStack gap={1}>
            <IconButton
              variant="ghost"
              color="gray.600"
              _hover={{ color: "black", bg: "gray.100" }}
              _dark={{ color: "gray.400", _hover: { color: "white", bg: "gray.700" } }}
              onClick={toggleColorMode}
              aria-label="Toggle dark mode"
            >
              {colorMode === "light" ? <FiSun /> : <FiMoon />}
            </IconButton>
            <IconButton
              variant="ghost"
              color="gray.600"
              _hover={{ color: "black", bg: "gray.100" }}
              _dark={{ color: "gray.400", _hover: { color: "white", bg: "gray.700" } }}
              onClick={() => router.push('/')}
              aria-label="Home"
            >
              <FiHome />
            </IconButton>
          </HStack>
          <UserButton afterSignOutUrl="/" />
        </Flex>

        {/* Main Content */}
        <Box py={12} px={{ base: 6, md: 12 }} maxW="100%">
          <VStack gap={8} align="stretch">
            {/* Header Section */}
            <VStack gap={2} align="start">
              <Heading size="xl" color="black" _dark={{ color: "white" }} fontWeight="600">
                Your Notebooks
              </Heading>
              <Text color="gray.500" _dark={{ color: "gray.400" }} fontSize="md">
                Create a new notebook or continue where you left off
              </Text>
            </VStack>

            {/* Notebooks Grid */}
            <Grid
              templateColumns="repeat(auto-fill, minmax(280px, 1fr))"
              gap={4}
            >
              {/* New Notebook Card */}
              {!isCreating ? (
                <Box
                  p={8}
                  bg="white"
                  borderRadius="lg"
                  border="1px dashed"
                  borderColor="gray.300"
                  cursor="pointer"
                  transition="all 0.2s"
                  minH="180px"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  _hover={{
                    borderColor: "black",
                    bg: "gray.50",
                  }}
                  _dark={{
                    bg: "gray.800",
                    borderColor: "gray.600",
                    _hover: { borderColor: "white", bg: "gray.700" }
                  }}
                  onClick={() => setIsCreating(true)}
                >
                  <VStack gap={3}>
                    <Box
                      p={3}
                      bg="black"
                      _dark={{ bg: "white" }}
                      borderRadius="full"
                    >
                      <Icon as={FiPlus} boxSize={5} color="white" _dark={{ color: "black" }} />
                    </Box>
                    <Text
                      color="gray.700"
                      _dark={{ color: "gray.300" }}
                      fontWeight="500"
                      fontSize="sm"
                    >
                      New Notebook
                    </Text>
                  </VStack>
                </Box>
              ) : (
                <Box
                  p={5}
                  bg="white"
                  borderRadius="lg"
                  border="1px solid"
                  borderColor="black"
                  minH="180px"
                  _dark={{ bg: "gray.800", borderColor: "white" }}
                >
                  <VStack gap={4} align="stretch" h="full" justify="space-between">
                    <VStack gap={3} align="stretch">
                      <Text size="sm" color="black" _dark={{ color: "white" }} fontWeight="600">
                        New Notebook
                      </Text>
                      <Input
                        placeholder="Name your notebook..."
                        value={newSessionName}
                        onChange={(e) => setNewSessionName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") createNewSession();
                          if (e.key === "Escape") {
                            setIsCreating(false);
                            setNewSessionName("");
                          }
                        }}
                        size="md"
                        bg="white"
                        border="1px solid"
                        borderColor="gray.300"
                        color="black"
                        _placeholder={{ color: "gray.400" }}
                        _focus={{ borderColor: "black", boxShadow: "none" }}
                        _dark={{
                          bg: "gray.700",
                          borderColor: "gray.600",
                          color: "white",
                          _focus: { borderColor: "white" }
                        }}
                        borderRadius="md"
                        autoFocus
                      />
                    </VStack>
                    <HStack gap={2}>
                      <Button
                        size="sm"
                        bg="black"
                        color="white"
                        _hover={{ bg: "gray.800" }}
                        _dark={{ bg: "white", color: "black", _hover: { bg: "gray.200" } }}
                        onClick={createNewSession}
                        flex={1}
                      >
                        Create
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        color="black"
                        borderColor="gray.300"
                        _hover={{ bg: "gray.50" }}
                        _dark={{ color: "white", borderColor: "gray.600", _hover: { bg: "gray.700" } }}
                        onClick={() => {
                          setIsCreating(false);
                          setNewSessionName("");
                        }}
                        flex={1}
                      >
                        Cancel
                      </Button>
                    </HStack>
                  </VStack>
                </Box>
              )}

              {/* Existing Sessions */}
              {sessions.map((session) => (
                <Box
                  key={session.id}
                  p={5}
                  bg="white"
                  borderRadius="lg"
                  border="1px solid"
                  borderColor="gray.200"
                  cursor="pointer"
                  transition="all 0.2s"
                  minH="180px"
                  _hover={{
                    borderColor: "black",
                    bg: "gray.50",
                  }}
                  _dark={{
                    bg: "gray.800",
                    borderColor: "gray.700",
                    _hover: { borderColor: "white", bg: "gray.700" }
                  }}
                  onClick={() => editingSession !== session.id && openSession(session.id)}
                >
                  <Flex direction="column" gap={4} h="full">
                    <Flex align="start" justify="space-between">
                      <VStack align="start" gap={2} flex={1}>
                        {editingSession === session.id ? (
                          <HStack gap={2} w="full" onClick={(e) => e.stopPropagation()}>
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveSessionName(session.id, e);
                                if (e.key === "Escape") cancelEditing(e);
                              }}
                              size="sm"
                              bg="white"
                              border="1px solid"
                              borderColor="black"
                              color="black"
                              _focus={{ boxShadow: "none" }}
                              _dark={{
                                bg: "gray.700",
                                borderColor: "white",
                                color: "white"
                              }}
                              autoFocus
                            />
                            <IconButton
                              size="xs"
                              variant="ghost"
                              color="green.500"
                              _hover={{ bg: "green.50" }}
                              aria-label="Save"
                              onClick={(e) => saveSessionName(session.id, e)}
                            >
                              <FiCheck />
                            </IconButton>
                            <IconButton
                              size="xs"
                              variant="ghost"
                              color="gray.400"
                              _hover={{ bg: "gray.100" }}
                              aria-label="Cancel"
                              onClick={cancelEditing}
                            >
                              <FiX />
                            </IconButton>
                          </HStack>
                        ) : (
                          <>
                            <Text fontWeight="500" color="black" _dark={{ color: "white" }} fontSize="md" noOfLines={2}>
                              {session.name}
                            </Text>
                            <HStack gap={3} fontSize="xs" color="gray.500">
                              <HStack gap={1}>
                                <FiClock size={12} />
                                <Text>{formatDate(session.createdAt || session.id)}</Text>
                              </HStack>
                              {session.messageCount > 0 && (
                                <HStack gap={1}>
                                  <FiMessageSquare size={12} />
                                  <Text>{session.messageCount}</Text>
                                </HStack>
                              )}
                            </HStack>
                          </>
                        )}
                      </VStack>
                      {editingSession !== session.id && (
                        <VStack gap={1}>
                          <IconButton
                            size="xs"
                            variant="ghost"
                            color="gray.400"
                            _hover={{ color: "black", bg: "gray.100" }}
                            _dark={{ color: "gray.500", _hover: { color: "white", bg: "gray.700" } }}
                            aria-label="Edit"
                            onClick={(e) => startEditing(session, e)}
                          >
                            <FiEdit2 />
                          </IconButton>
                          <IconButton
                            size="xs"
                            variant="ghost"
                            color="gray.400"
                            _hover={{ color: "black", bg: "gray.100" }}
                            _dark={{ color: "gray.500", _hover: { color: "white", bg: "gray.700" } }}
                            aria-label="Open"
                            onClick={(e) => {
                              e.stopPropagation();
                              openSession(session.id);
                            }}
                          >
                            <FiArrowRight />
                          </IconButton>
                          <IconButton
                            size="xs"
                            variant="ghost"
                            color="gray.400"
                            _hover={{ color: "red.500", bg: "red.50" }}
                            _dark={{ color: "gray.500", _hover: { color: "red.400", bg: "red.900" } }}
                            aria-label="Delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmDelete(session.id, session.name);
                            }}
                          >
                            <FiTrash2 />
                          </IconButton>
                        </VStack>
                      )}
                    </Flex>

                    {session.uploadedFiles && session.uploadedFiles.length > 0 && (
                      <Box
                        mt="auto"
                        p={2}
                        bg="gray.50"
                        _dark={{ bg: "gray.700" }}
                        borderRadius="md"
                      >
                        <HStack gap={1} fontSize="xs" color="gray.600" _dark={{ color: "gray.400" }}>
                          <FiFile size={12} />
                          <Text fontWeight="500">
                            {session.uploadedFiles.length} {session.uploadedFiles.length === 1 ? 'source' : 'sources'}
                          </Text>
                        </HStack>
                      </Box>
                    )}
                  </Flex>
                </Box>
              ))}
            </Grid>
          </VStack>
        </Box>
      </Box>

      {/* Delete Confirmation Dialog */}
      <DialogRoot
        open={!!sessionToDelete}
        onOpenChange={(e) => {
          if (!e.open) setSessionToDelete(null);
        }}
      >
        <DialogContent bg="white" border="1px solid" borderColor="gray.200" _dark={{ bg: "gray.800", borderColor: "gray.700" }}>
          <DialogHeader>
            <DialogTitle color="black" _dark={{ color: "white" }} fontWeight="600">Delete Notebook</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <VStack gap={3} align="start">
              <HStack gap={2} color="gray.600" _dark={{ color: "gray.400" }}>
                <FiAlertCircle size={20} />
                <Text fontWeight="500">Are you sure?</Text>
              </HStack>
              <Text color="gray.600" _dark={{ color: "gray.300" }}>
                You're about to delete <strong>"{sessionToDelete?.name}"</strong>.
                This will permanently remove all messages and files.
              </Text>
              <Text fontSize="sm" color="gray.400">
                This action cannot be undone.
              </Text>
            </VStack>
          </DialogBody>
          <DialogFooter>
            <DialogActionTrigger asChild>
              <Button
                variant="outline"
                borderColor="gray.300"
                color="black"
                _hover={{ bg: "gray.50" }}
                _dark={{ color: "white", borderColor: "gray.600", _hover: { bg: "gray.700" } }}
                onClick={() => setSessionToDelete(null)}
              >
                Cancel
              </Button>
            </DialogActionTrigger>
            <Button
              bg="black"
              color="white"
              _hover={{ bg: "gray.800" }}
              _dark={{ bg: "white", color: "black", _hover: { bg: "gray.200" } }}
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
