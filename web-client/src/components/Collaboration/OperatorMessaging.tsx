/**
 * Operator Messaging Component
 * Provides operator-to-operator messaging functionality
 * Implements requirements 16.2, 16.6
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  Badge,
} from '@mui/material';
import {
  Send as SendIcon,
  Message as MessageIcon,
  Campaign as BroadcastIcon,
  PriorityHigh as PriorityIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useAuth } from '../../hooks/useAuth';

interface OperatorMessage {
  id: string;
  fromOperatorId: string;
  toOperatorId?: string;
  message: string;
  timestamp: string;
  type: 'direct' | 'broadcast' | 'system';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  metadata?: {
    implantId?: string;
    commandId?: string;
    sessionId?: string;
  };
}

interface OperatorMessagingProps {
  targetOperatorId?: string;
  targetUsername?: string;
  onClose?: () => void;
}

export const OperatorMessaging: React.FC<OperatorMessagingProps> = ({
  targetOperatorId,
  targetUsername,
  onClose,
}) => {
  const { user } = useAuth();
  const { socket, isConnected } = useWebSocket();
  const [messages, setMessages] = useState<OperatorMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [messageType, setMessageType] = useState<'direct' | 'broadcast'>('direct');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Request initial messages
    socket.emit('requestMessages', { limit: 50 });

    // Listen for new messages
    const handleNewMessage = (message: OperatorMessage) => {
      setMessages(prev => {
        // Avoid duplicates
        if (prev.find(m => m.id === message.id)) return prev;
        return [...prev, message].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
      });

      // Increment unread count if message is not from current user
      if (message.fromOperatorId !== user?.id) {
        setUnreadCount(prev => prev + 1);
      }
    };

    const handleMessages = (data: { messages: OperatorMessage[] }) => {
      setMessages(
        data.messages.sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
      );
    };

    socket.on('newMessage', handleNewMessage);
    socket.on('messages', handleMessages);

    return () => {
      socket.off('newMessage', handleNewMessage);
      socket.off('messages', handleMessages);
    };
  }, [socket, isConnected, user?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Set target operator if provided
  useEffect(() => {
    if (targetOperatorId) {
      setMessageType('direct');
    }
  }, [targetOperatorId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = () => {
    if (!newMessage.trim() || !socket) return;

    const messageData = {
      toOperatorId: messageType === 'direct' ? targetOperatorId || undefined : undefined,
      message: newMessage.trim(),
      type: messageType,
      priority,
    };

    socket.emit('sendMessage', messageData);
    setNewMessage('');
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return '#f44336';
      case 'high':
        return '#ff9800';
      case 'normal':
        return '#2196f3';
      case 'low':
        return '#9e9e9e';
      default:
        return '#2196f3';
    }
  };

  const getMessageIcon = (type: string) => {
    switch (type) {
      case 'broadcast':
        return <BroadcastIcon />;
      case 'system':
        return <PriorityIcon />;
      default:
        return <MessageIcon />;
    }
  };

  const filteredMessages = targetOperatorId
    ? messages.filter(
        msg =>
          (msg.fromOperatorId === user?.id && msg.toOperatorId === targetOperatorId) ||
          (msg.fromOperatorId === targetOperatorId && msg.toOperatorId === user?.id) ||
          msg.type === 'broadcast' ||
          msg.type === 'system'
      )
    : messages;

  const content = (
    <Box display="flex" flexDirection="column" height="100%">
      {/* Messages List */}
      <Box flex={1} overflow="auto" p={1}>
        <List dense>
          {filteredMessages.map(message => {
            const isFromCurrentUser = message.fromOperatorId === user?.id;
            const isDirectToUser = message.toOperatorId === user?.id;
            const isBroadcast = message.type === 'broadcast';
            const isSystem = message.type === 'system';

            return (
              <ListItem
                key={message.id}
                sx={{
                  flexDirection: 'column',
                  alignItems: isFromCurrentUser ? 'flex-end' : 'flex-start',
                  mb: 1,
                }}
              >
                <Box
                  sx={{
                    maxWidth: '70%',
                    backgroundColor: isFromCurrentUser
                      ? 'primary.main'
                      : isSystem
                        ? 'warning.light'
                        : 'grey.100',
                    color: isFromCurrentUser || isSystem ? 'white' : 'text.primary',
                    borderRadius: 2,
                    p: 1.5,
                    position: 'relative',
                  }}
                >
                  {!isFromCurrentUser && (
                    <Typography variant="caption" fontWeight="bold" display="block">
                      {message.fromOperatorId}
                      {isBroadcast && ' (Broadcast)'}
                      {isDirectToUser && ' (Direct)'}
                    </Typography>
                  )}

                  <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                    {message.message}
                  </Typography>

                  <Box display="flex" alignItems="center" justifyContent="space-between" mt={0.5}>
                    <Typography variant="caption" sx={{ opacity: 0.8 }}>
                      {formatTimestamp(message.timestamp)}
                    </Typography>

                    {message.priority !== 'normal' && (
                      <Chip
                        size="small"
                        label={message.priority}
                        sx={{
                          backgroundColor: getPriorityColor(message.priority),
                          color: 'white',
                          fontSize: '0.6rem',
                          height: 16,
                          ml: 1,
                        }}
                      />
                    )}
                  </Box>
                </Box>
              </ListItem>
            );
          })}
        </List>
        <div ref={messagesEndRef} />
      </Box>

      <Divider />

      {/* Message Input */}
      <Box p={2}>
        <Box display="flex" gap={1} mb={1}>
          {!targetOperatorId && (
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Type</InputLabel>
              <Select
                value={messageType}
                label="Type"
                onChange={e => setMessageType(e.target.value as any)}
              >
                <MenuItem value="direct">Direct</MenuItem>
                <MenuItem value="broadcast">Broadcast</MenuItem>
              </Select>
            </FormControl>
          )}

          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel>Priority</InputLabel>
            <Select
              value={priority}
              label="Priority"
              onChange={e => setPriority(e.target.value as any)}
            >
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="normal">Normal</MenuItem>
              <MenuItem value="high">High</MenuItem>
              <MenuItem value="urgent">Urgent</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Box display="flex" gap={1}>
          <TextField
            fullWidth
            multiline
            maxRows={3}
            placeholder={
              targetOperatorId
                ? `Message ${targetUsername}...`
                : messageType === 'broadcast'
                  ? 'Broadcast message to all operators...'
                  : 'Type your message...'
            }
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={!isConnected}
          />
          <Button
            variant="contained"
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || !isConnected}
            sx={{ minWidth: 'auto', px: 2 }}
          >
            <SendIcon />
          </Button>
        </Box>
      </Box>
    </Box>
  );

  if (targetOperatorId) {
    // Render as dialog for direct messaging
    return (
      <Dialog
        open={true}
        onClose={onClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { height: '70vh' } }}
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">Message {targetUsername}</Typography>
            <IconButton onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  // Render as card for general messaging
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardHeader
        title={
          <Box display="flex" alignItems="center" gap={1}>
            <Badge badgeContent={unreadCount} color="error">
              <MessageIcon />
            </Badge>
            <Typography variant="h6">Operator Messages</Typography>
          </Box>
        }
        action={
          unreadCount > 0 && (
            <Button size="small" onClick={() => setUnreadCount(0)}>
              Mark Read
            </Button>
          )
        }
      />
      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 0 }}>
        {content}
      </CardContent>
    </Card>
  );
};
