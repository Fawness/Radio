const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// In-memory storage for lobbies
const lobbies = {};

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Host creates a lobby
  socket.on('create_lobby', (hostName, callback) => {
    const lobbyId = uuidv4();
    lobbies[lobbyId] = {
      host: socket.id,
      hostName,
      users: {},
      queue: [],
      currentVideo: null
    };
    socket.join(lobbyId);
    lobbies[lobbyId].users[socket.id] = { name: hostName, isHost: true };
    if (callback) callback({ lobbyId });
    console.log(`Lobby created: ${lobbyId} by host ${hostName}`);
  });

  // User joins a lobby
  socket.on('join_lobby', ({ lobbyId, userName }, callback) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) {
      if (callback) callback({ error: 'Lobby not found' });
      return;
    }
    if (lobby.banned && lobby.banned.includes(socket.id)) {
      if (callback) callback({ error: 'You are banned from this lobby' });
      return;
    }
    lobby.users[socket.id] = { name: userName, isHost: false };
    socket.join(lobbyId);
    if (callback) callback({
      lobbyId,
      hostName: lobby.hostName,
      users: Object.entries(lobby.users).map(([socketId, u]) => ({
        socketId,
        name: u.name,
        isHost: u.isHost
      })),
      queue: lobby.queue,
      currentVideo: lobby.currentVideo
    });
    // Notify others in the lobby
    socket.to(lobbyId).emit('user_joined', { name: userName });
    // Broadcast updated user list
    io.to(lobbyId).emit('user_list', Object.entries(lobby.users).map(([socketId, u]) => ({
      socketId,
      name: u.name,
      isHost: u.isHost
    })));
    console.log(`${userName} joined lobby ${lobbyId}`);
  });

  // Text chat feature
  socket.on('send_message', ({ lobbyId, message }, callback) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || !lobby.users[socket.id]) return;
    const userName = lobby.users[socket.id].name;
    const chatMessage = {
      user: userName,
      message,
      timestamp: new Date().toISOString()
    };
    io.to(lobbyId).emit('receive_message', chatMessage);
    if (callback) callback({ success: true });
  });

  // Add video to queue
  socket.on('add_video', ({ lobbyId, url }, callback) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || !lobby.users[socket.id]) return;
    // Basic YouTube URL validation
    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+/;
    if (!ytRegex.test(url)) {
      if (callback) callback({ error: 'Invalid YouTube URL' });
      return;
    }
    // Prevent duplicate videos
    if (lobby.queue.some(v => v.url === url)) {
      if (callback) callback({ error: 'Video already in queue' });
      return;
    }
    const video = {
      url,
      addedBy: lobby.users[socket.id].name,
      likes: 0,
      dislikes: 0,
      likedBy: [],
      dislikedBy: [],
      played: false
    };
    lobby.queue.push(video);
    broadcastQueue(lobbyId);
    if (callback) callback({ success: true });
    console.log(`${lobby.users[socket.id].name} added video to lobby ${lobbyId}`);
  });

  // Helper: broadcast queue with like/dislike user names
  function broadcastQueue(lobbyId) {
    const lobby = lobbies[lobbyId];
    if (!lobby) return;
    const queueWithNames = lobby.queue.map(video => ({
      ...video,
      likedByNames: video.likedBy.map(id => lobby.users[id]?.name).filter(Boolean),
      dislikedByNames: video.dislikedBy.map(id => lobby.users[id]?.name).filter(Boolean)
    }));
    io.to(lobbyId).emit('queue_updated', queueWithNames);
  }

  // Host skips current video
  socket.on('skip_video', ({ lobbyId }, callback) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || lobby.host !== socket.id) {
      if (callback) callback({ error: 'Only the host can skip videos' });
      return;
    }
    if (lobby.queue.length > 0) {
      // Mark current video as played and move to back
      const video = lobby.queue.shift();
      video.played = true;
      lobby.queue.push(video);
      broadcastQueue(lobbyId);
      io.to(lobbyId).emit('video_skipped', video);
      if (callback) callback({ success: true });
      console.log(`Host skipped video in lobby ${lobbyId}`);
    }
  });

  // Host kicks a user from the lobby
  socket.on('kick_user', ({ lobbyId, userSocketId }, callback) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || lobby.host !== socket.id) {
      if (callback) callback({ error: 'Only the host can kick users' });
      return;
    }
    if (!lobby.users[userSocketId] || userSocketId === socket.id) {
      if (callback) callback({ error: 'Invalid user to kick' });
      return;
    }
    const kickedUserName = lobby.users[userSocketId].name;
    delete lobby.users[userSocketId];
    io.to(userSocketId).emit('kicked', { lobbyId });
    io.to(lobbyId).emit('user_left', { name: kickedUserName });
    io.to(lobbyId).emit('user_list', Object.entries(lobby.users).map(([socketId, u]) => ({
      socketId,
      name: u.name,
      isHost: u.isHost
    })));
    console.log(`Host kicked user ${kickedUserName} from lobby ${lobbyId}`);
    if (callback) callback({ success: true });
  });

  // Host deletes a video from the queue
  socket.on('delete_video', ({ lobbyId, index }, callback) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || lobby.host !== socket.id) return;
    if (index >= 0 && index < lobby.queue.length) {
      const [removed] = lobby.queue.splice(index, 1);
      broadcastQueue(lobbyId);
      if (callback) callback({ success: true });
      console.log(`Host deleted video from queue in lobby ${lobbyId}`);
    }
  });

  // Like/dislike current video
  socket.on('like_video', ({ lobbyId, undo }, callback) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || !lobby.users[socket.id] || lobby.queue.length === 0) return;
    const video = lobby.queue[0];
    if (undo) {
      // Undo like
      const idx = video.likedBy.indexOf(socket.id);
      if (idx !== -1) {
        video.likes--;
        video.likedBy.splice(idx, 1);
        reorderQueue(lobby);
        broadcastQueue(lobbyId);
        if (callback) callback({ success: true });
      }
      return;
    }
    if (!video.likedBy.includes(socket.id)) {
      video.likes++;
      video.likedBy.push(socket.id);
      // Remove dislike if present
      const dislikeIdx = video.dislikedBy.indexOf(socket.id);
      if (dislikeIdx !== -1) {
        video.dislikes--;
        video.dislikedBy.splice(dislikeIdx, 1);
      }
      reorderQueue(lobby);
      broadcastQueue(lobbyId);
      if (callback) callback({ success: true });
    }
  });

  socket.on('dislike_video', ({ lobbyId, undo }, callback) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || !lobby.users[socket.id] || lobby.queue.length === 0) return;
    const video = lobby.queue[0];
    if (undo) {
      // Undo dislike
      const idx = video.dislikedBy.indexOf(socket.id);
      if (idx !== -1) {
        video.dislikes--;
        video.dislikedBy.splice(idx, 1);
        reorderQueue(lobby);
        broadcastQueue(lobbyId);
        if (callback) callback({ success: true });
      }
      return;
    }
    if (!video.dislikedBy.includes(socket.id)) {
      video.dislikes++;
      video.dislikedBy.push(socket.id);
      // Remove like if present
      const likeIdx = video.likedBy.indexOf(socket.id);
      if (likeIdx !== -1) {
        video.likes--;
        video.likedBy.splice(likeIdx, 1);
      }
      reorderQueue(lobby);
      broadcastQueue(lobbyId);
      if (callback) callback({ success: true });
    }
  });

  // Helper: reorder queue
  function reorderQueue(lobby) {
    // 1. Videos with more dislikes go to the back
    // 2. Videos with more likes are higher
    // 3. Videos queued by active users play next
    const activeUserNames = Object.values(lobby.users).map(u => u.name);
    const [current, ...rest] = lobby.queue;
    rest.sort((a, b) => {
      // Disliked videos always at the back
      if (a.dislikes > 0 && b.dislikes === 0) return 1;
      if (b.dislikes > 0 && a.dislikes === 0) return -1;
      if (a.dislikes > 0 && b.dislikes > 0) return 0;
      // Videos queued by active users play next
      const aActive = activeUserNames.includes(a.addedBy);
      const bActive = activeUserNames.includes(b.addedBy);
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      // More likes = higher
      return b.likes - a.likes;
    });
    lobby.queue = [current, ...rest];
  }

  // Host bans a user from the lobby
  socket.on('ban_user', ({ lobbyId, userSocketId }, callback) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || lobby.host !== socket.id) {
      if (callback) callback({ error: 'Only the host can ban users' });
      return;
    }
    if (!lobby.users[userSocketId] || userSocketId === socket.id) {
      if (callback) callback({ error: 'Invalid user to ban' });
      return;
    }
    const bannedUserName = lobby.users[userSocketId].name;
    lobby.banned = lobby.banned || [];
    lobby.banned.push(userSocketId);
    delete lobby.users[userSocketId];
    io.to(userSocketId).emit('banned', { lobbyId });
    io.to(lobbyId).emit('user_left', { name: bannedUserName });
    io.to(lobbyId).emit('user_list', Object.entries(lobby.users).map(([socketId, u]) => ({
      socketId,
      name: u.name,
      isHost: u.isHost
    })));
    console.log(`Host banned user ${bannedUserName} from lobby ${lobbyId}`);
    if (callback) callback({ success: true });
  });

  // Host transfers host role to another user
  socket.on('transfer_host', ({ lobbyId, newHostSocketId }, callback) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || lobby.host !== socket.id) {
      if (callback) callback({ error: 'Only the host can transfer host role' });
      return;
    }
    if (!lobby.users[newHostSocketId] || newHostSocketId === socket.id) {
      if (callback) callback({ error: 'Invalid user to transfer host role' });
      return;
    }
    // Remove host from current host
    lobby.users[socket.id].isHost = false;
    // Assign new host
    lobby.users[newHostSocketId].isHost = true;
    lobby.host = newHostSocketId;
    lobby.hostName = lobby.users[newHostSocketId].name;
    io.to(lobbyId).emit('host_changed', { newHost: lobby.hostName });
    io.to(lobbyId).emit('user_list', Object.entries(lobby.users).map(([socketId, u]) => ({
      socketId,
      name: u.name,
      isHost: u.isHost
    })));
    console.log(`Host transferred host role to ${lobby.hostName} in lobby ${lobbyId}`);
    if (callback) callback({ success: true });
  });

  // Sync playback for new users or reconnects
  socket.on('request_sync', ({ lobbyId }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || !lobby.host) return;
    // Forward request to host
    io.to(lobby.host).emit('request_host_sync', { requester: socket.id });
  });

  // Host responds with current time and state
  socket.on('host_sync', ({ lobbyId, requester, time, state }) => {
    io.to(requester).emit('host_sync', { time, state });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Find and clean up user from lobbies
    for (const [lobbyId, lobby] of Object.entries(lobbies)) {
      if (lobby.users[socket.id]) {
        const wasHost = lobby.users[socket.id].isHost;
        const userName = lobby.users[socket.id].name;
        delete lobby.users[socket.id];
        socket.to(lobbyId).emit('user_left', { name: userName });
        // Broadcast updated user list
        io.to(lobbyId).emit('user_list', Object.entries(lobby.users).map(([socketId, u]) => ({
          socketId,
          name: u.name,
          isHost: u.isHost
        })));
        // If host left, assign new host or delete lobby
        if (wasHost) {
          const userIds = Object.keys(lobby.users);
          if (userIds.length > 0) {
            // Assign new host
            const newHostId = userIds[0];
            lobby.users[newHostId].isHost = true;
            lobby.host = newHostId;
            lobby.hostName = lobby.users[newHostId].name;
            io.to(lobbyId).emit('host_changed', { newHost: lobby.hostName });
            console.log(`Host left. New host for lobby ${lobbyId}: ${lobby.hostName}`);
          } else {
            // No users left, delete lobby
            delete lobbies[lobbyId];
            console.log(`Lobby ${lobbyId} deleted (no users left)`);
          }
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
}); 