import Head from "next/head";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Box,
  Button,
  Container,
  Heading,
  Text,
  VStack,
  HStack,
  Progress,
  Card,
  List,
} from "@chakra-ui/react";
import { FiCheckCircle, FiAlertCircle, FiDatabase } from "react-icons/fi";

export default function Migrate() {
  const { user, loading } = useAuth();
  const isLoaded = !loading;
  const [migrationStatus, setMigrationStatus] = useState("idle"); // idle, running, success, error
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({
    sessionsFound: 0,
    sessionsMigrated: 0,
    messagesFound: 0,
    messagesMigrated: 0,
  });

  const addLog = (message, type = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { message, type, timestamp }]);
  };

  const migrateData = async () => {
    if (!user) {
      addLog("Please sign in first", "error");
      return;
    }

    setMigrationStatus("running");
    setProgress(0);
    setLogs([]);

    try {
      addLog("Starting migration from localStorage to Supabase...", "info");

      // Step 1: Find all localStorage sessions
      const storageKey = `chatSessions_${user.id}`;
      const savedSessions = localStorage.getItem(storageKey);

      if (!savedSessions) {
        addLog("No sessions found in localStorage", "warning");
        setMigrationStatus("success");
        return;
      }

      const sessions = JSON.parse(savedSessions);
      setStats(prev => ({ ...prev, sessionsFound: sessions.length }));
      addLog(`Found ${sessions.length} sessions in localStorage`, "success");
      setProgress(10);

      // Step 2: Migrate each session
      let totalMessages = 0;
      let migratedMessages = 0;

      for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];
        addLog(`Migrating session: "${session.name}"...`, "info");

        // Create session in Supabase
        try {
          const sessionResponse = await fetch('/api/sessions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: session.id,
              name: session.name,
              tutoring_mode: 'direct',
            }),
          });

          if (!sessionResponse.ok) {
            const error = await sessionResponse.json();
            if (error.details?.includes('duplicate key')) {
              addLog(`Session "${session.name}" already exists, skipping...`, "warning");
            } else {
              throw new Error(`Failed to create session: ${error.error}`);
            }
          } else {
            setStats(prev => ({ ...prev, sessionsMigrated: prev.sessionsMigrated + 1 }));
            addLog(`✓ Session "${session.name}" created`, "success");
          }
        } catch (error) {
          addLog(`✗ Failed to create session "${session.name}": ${error.message}`, "error");
          continue;
        }

        // Get messages for this session
        const chatData = localStorage.getItem(`chat_${session.id}`);
        if (chatData) {
          const data = JSON.parse(chatData);
          const messages = data.messages || [];
          totalMessages += messages.length;
          setStats(prev => ({ ...prev, messagesFound: totalMessages }));

          addLog(`  Found ${messages.length} messages for this session`, "info");

          // Migrate each message
          for (const message of messages) {
            try {
              const messageResponse = await fetch('/api/messages', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  session_id: session.id,
                  role: message.role,
                  content: typeof message.content === 'string'
                    ? message.content
                    : JSON.stringify(message.content),
                  citations: message.citations || null,
                }),
              });

              if (!messageResponse.ok) {
                throw new Error('Failed to create message');
              }

              migratedMessages++;
              setStats(prev => ({ ...prev, messagesMigrated: migratedMessages }));
            } catch (error) {
              addLog(`  ✗ Failed to migrate a message: ${error.message}`, "error");
            }
          }

          addLog(`  ✓ Migrated ${messages.length} messages`, "success");
        }

        setProgress(10 + (i + 1) / sessions.length * 80);
      }

      setProgress(100);
      addLog("Migration completed successfully!", "success");
      addLog(`Total: ${stats.sessionsMigrated} sessions, ${migratedMessages} messages migrated`, "success");
      setMigrationStatus("success");

    } catch (error) {
      addLog(`Migration failed: ${error.message}`, "error");
      setMigrationStatus("error");
    }
  };

  return (
    <>
      <Head>
        <title>Migrate to Supabase - PaperSage</title>
        <meta name="description" content="Migrate your data to Supabase" />
      </Head>

      <Container maxW="4xl" py={12}>
        <VStack gap={8} align="stretch">
          <VStack gap={2} align="center" textAlign="center">
            <FiDatabase size={48} color="var(--chakra-colors-blue-500)" />
            <Heading size="2xl">Migrate to Supabase</Heading>
            <Text color="gray.600" _dark={{ color: "gray.400" }}>
              Transfer your localStorage data to Supabase database
            </Text>
          </VStack>

          {/* Stats Card */}
          <Card.Root p={6} bg="white" _dark={{ bg: "gray.800" }}>
            <VStack gap={4} align="stretch">
              <Heading size="md">Migration Status</Heading>
              <HStack justify="space-around" flexWrap="wrap">
                <VStack>
                  <Text fontSize="2xl" fontWeight="bold" color="blue.500">
                    {stats.sessionsFound}
                  </Text>
                  <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }}>
                    Sessions Found
                  </Text>
                </VStack>
                <VStack>
                  <Text fontSize="2xl" fontWeight="bold" color="green.500">
                    {stats.sessionsMigrated}
                  </Text>
                  <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }}>
                    Sessions Migrated
                  </Text>
                </VStack>
                <VStack>
                  <Text fontSize="2xl" fontWeight="bold" color="blue.500">
                    {stats.messagesFound}
                  </Text>
                  <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }}>
                    Messages Found
                  </Text>
                </VStack>
                <VStack>
                  <Text fontSize="2xl" fontWeight="bold" color="green.500">
                    {stats.messagesMigrated}
                  </Text>
                  <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }}>
                    Messages Migrated
                  </Text>
                </VStack>
              </HStack>

              {migrationStatus === "running" && (
                <Box>
                  <Progress value={progress} size="sm" colorScheme="blue" />
                  <Text fontSize="xs" color="gray.500" mt={1}>
                    {Math.round(progress)}% complete
                  </Text>
                </Box>
              )}
            </VStack>
          </Card.Root>

          {/* Action Button */}
          {migrationStatus === "idle" && (
            <Button
              colorScheme="blue"
              size="lg"
              onClick={migrateData}
              isDisabled={!isLoaded || !user}
            >
              Start Migration
            </Button>
          )}

          {migrationStatus === "success" && (
            <Card.Root p={6} bg="green.50" _dark={{ bg: "green.900" }} borderColor="green.500" borderWidth={2}>
              <HStack gap={3}>
                <FiCheckCircle size={24} color="var(--chakra-colors-green-500)" />
                <VStack align="start" gap={1}>
                  <Text fontWeight="600" color="green.700" _dark={{ color: "green.200" }}>
                    Migration Completed Successfully!
                  </Text>
                  <Text fontSize="sm" color="green.600" _dark={{ color: "green.300" }}>
                    Your data is now in Supabase. You can safely clear localStorage if desired.
                  </Text>
                </VStack>
              </HStack>
            </Card.Root>
          )}

          {migrationStatus === "error" && (
            <Card.Root p={6} bg="red.50" _dark={{ bg: "red.900" }} borderColor="red.500" borderWidth={2}>
              <HStack gap={3}>
                <FiAlertCircle size={24} color="var(--chakra-colors-red-500)" />
                <VStack align="start" gap={1}>
                  <Text fontWeight="600" color="red.700" _dark={{ color: "red.200" }}>
                    Migration Failed
                  </Text>
                  <Text fontSize="sm" color="red.600" _dark={{ color: "red.300" }}>
                    Check the logs below for details. You can try again.
                  </Text>
                </VStack>
              </HStack>
            </Card.Root>
          )}

          {/* Migration Logs */}
          {logs.length > 0 && (
            <Card.Root p={6} bg="white" _dark={{ bg: "gray.800" }}>
              <VStack gap={4} align="stretch">
                <Heading size="md">Migration Logs</Heading>
                <Box
                  maxH="400px"
                  overflowY="auto"
                  p={4}
                  bg="gray.50"
                  _dark={{ bg: "gray.900" }}
                  borderRadius="md"
                  fontFamily="mono"
                  fontSize="sm"
                >
                  <List.Root gap={2}>
                    {logs.map((log, idx) => (
                      <List.Item key={idx}>
                        <HStack gap={2}>
                          <Text color="gray.500" fontSize="xs">
                            {log.timestamp}
                          </Text>
                          <Text
                            color={
                              log.type === "error"
                                ? "red.500"
                                : log.type === "success"
                                ? "green.500"
                                : log.type === "warning"
                                ? "orange.500"
                                : "gray.700"
                            }
                          >
                            {log.message}
                          </Text>
                        </HStack>
                      </List.Item>
                    ))}
                  </List.Root>
                </Box>
              </VStack>
            </Card.Root>
          )}

          {/* Instructions */}
          <Card.Root p={6} bg="blue.50" _dark={{ bg: "blue.900" }}>
            <VStack gap={3} align="start">
              <Heading size="sm" color="blue.700" _dark={{ color: "blue.200" }}>
                Instructions
              </Heading>
              <List.Root gap={2} fontSize="sm" color="blue.700" _dark={{ color: "blue.200" }}>
                <List.Item>1. Make sure you're signed in with the same account</List.Item>
                <List.Item>2. Click "Start Migration" to begin</List.Item>
                <List.Item>3. Wait for the migration to complete</List.Item>
                <List.Item>4. Check your Supabase dashboard to verify the data</List.Item>
                <List.Item>5. Once confirmed, you can clear localStorage if desired</List.Item>
              </List.Root>
            </VStack>
          </Card.Root>

          {migrationStatus === "success" && (
            <HStack gap={4}>
              <Button
                as="a"
                href="/sessions"
                colorScheme="blue"
                flex={1}
              >
                Go to Sessions
              </Button>
              <Button
                variant="outline"
                flex={1}
                onClick={() => {
                  setMigrationStatus("idle");
                  setProgress(0);
                  setLogs([]);
                  setStats({
                    sessionsFound: 0,
                    sessionsMigrated: 0,
                    messagesFound: 0,
                    messagesMigrated: 0,
                  });
                }}
              >
                Reset
              </Button>
            </HStack>
          )}
        </VStack>
      </Container>
    </>
  );
}
