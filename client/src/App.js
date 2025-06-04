import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import YouTube from 'react-youtube';
import {
  AppBar, Toolbar, Typography, Box, Paper, Button, TextField, List, ListItem, ListItemAvatar, ListItemText, Avatar, IconButton, Select, MenuItem, Divider, Tooltip, CssBaseline, Tabs, Tab
} from '@mui/material';
import { SkipNext, Delete, ThumbUp, ThumbDown, Person, Star, Block, Logout, SupervisorAccount, DarkMode, LightMode } from '@mui/icons-material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import './App.css';
import axios from 'axios';

const socket = io('http://localhost:4000'); // Adjust if backend runs elsewhere

function App() {
  const [step, setStep] = useState('welcome');
  const [name, setName] = useState('');
  const [lobbyId, setLobbyId] = useState('');
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);
  const [queue, setQueue] = useState([]);
  const [videoInput, setVideoInput] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [player, setPlayer] = useState(null);
  const syncNoticeTimeout = useRef(null);
  const [lastLobby, setLastLobby] = useState(null);
  const [darkMode, setDarkMode] = useState(true);
  const [mySocketId, setMySocketId] = useState('');
  const videoContainerRef = useRef(null);
  const [videoMeta, setVideoMeta] = useState({}); // { url: { title, thumbnail } }
  const [myLike, setMyLike] = useState(null); // 'like', 'dislike', or null
  const [tabValue, setTabValue] = useState(0);

  const theme = React.useMemo(() => createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
      ...(darkMode ? {
        primary: { main: '#1976d2' },
        background: { default: '#181c24', paper: '#23293a' },
      } : {
        primary: { main: '#1976d2' },
        background: { default: '#f4f6fa', paper: '#fff' },
      })
    },
  }), [darkMode]);

  useEffect(() => {
    setMySocketId(socket.id);
    socket.on('connect', () => setMySocketId(socket.id));
    return () => socket.off('connect');
  }, []);

  useEffect(() => {
    // Listen for user list updates
    socket.on('user_list', (userList) => {
      setUsers(userList);
      // Set host status for this client using socketId
      const me = userList.find(u => u.socketId === mySocketId);
      setIsHost(me?.isHost || false);
    });
    socket.on('user_joined', ({ name }) => {
      setMessages(msgs => [...msgs, { user: 'System', message: `${name} joined the lobby.` }]);
    });
    socket.on('user_left', ({ name }) => {
      setMessages(msgs => [...msgs, { user: 'System', message: `${name} left the lobby.` }]);
    });
    socket.on('receive_message', (msg) => {
      setMessages(msgs => [...msgs, msg]);
    });
    socket.on('queue_updated', setQueue);
    socket.on('sync_play', ({ time }) => {
      if (player) {
        player.seekTo(time, true);
        player.playVideo();
      }
    });
    socket.on('sync_pause', ({ time }) => {
      if (player) {
        player.seekTo(time, true);
        player.pauseVideo();
      }
    });
    socket.on('sync_end', () => {
      if (player) {
        player.stopVideo();
      }
    });
    socket.on('kicked', () => {
      setTimeout(() => {
        setStep('welcome');
      }, 2500);
    });
    socket.on('banned', () => {
      setTimeout(() => {
        setStep('welcome');
      }, 2500);
    });
    socket.on('video_skipped', (video) => {
    });
    return () => {
      socket.off('user_list');
      socket.off('user_joined');
      socket.off('user_left');
      socket.off('receive_message');
      socket.off('queue_updated');
      socket.off('sync_play');
      socket.off('sync_pause');
      socket.off('sync_end');
      socket.off('kicked');
      socket.off('banned');
      socket.off('video_skipped');
    };
  }, [player, mySocketId]);

  useEffect(() => {
    if (step === 'lobby') {
      setMessages([]); // Clear chat on new lobby join
    }
  }, [step, lobbyId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Store last lobby info for reconnects
  useEffect(() => {
    if (step === 'lobby' && lobbyId && name) {
      setLastLobby({ lobbyId, name });
    }
  }, [step, lobbyId, name]);

  // On reconnect, try to rejoin last lobby
  useEffect(() => {
    socket.on('connect', () => {
      if (lastLobby) {
        socket.emit('join_lobby', { lobbyId: lastLobby.lobbyId, userName: lastLobby.name }, (res) => {
          if (!res.error) setStep('lobby');
        });
      }
    });
    return () => {
      socket.off('connect');
    };
  }, [lastLobby]);

  // On join, request sync from host if a video is playing
  useEffect(() => {
    if (step === 'lobby' && queue.length > 0) {
      socket.emit('request_sync', { lobbyId });
    }
  }, [step, queue.length, lobbyId]);

  // Listen for host sync response
  useEffect(() => {
    socket.on('host_sync', ({ time, state }) => {
      if (player) {
        player.seekTo(time, true);
        if (state === 'playing') player.playVideo();
        else player.pauseVideo();
      }
    });
  }, [player]);

  // Update myLike when queue changes
  useEffect(() => {
    if (queue[0]) {
      if (queue[0].likedBy && queue[0].likedBy.includes(mySocketId)) setMyLike('like');
      else if (queue[0].dislikedBy && queue[0].dislikedBy.includes(mySocketId)) setMyLike('dislike');
      else setMyLike(null);
    } else {
      setMyLike(null);
    }
  }, [queue, mySocketId]);

  // Handle create lobby
  const handleCreateLobby = () => {
    if (!name) return setError('Enter your name');
    socket.emit('create_lobby', name, ({ lobbyId }) => {
      setLobbyId(lobbyId);
      setStep('lobby');
    });
  };

  // Handle join lobby
  const handleJoinLobby = () => {
    if (!name || !lobbyId) return setError('Enter your name and lobby ID');
    socket.emit('join_lobby', { lobbyId, userName: name }, (res) => {
      if (res.error) return setError(res.error);
      setStep('lobby');
    });
  };

  // Send chat message
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('send_message', { lobbyId, message: chatInput }, () => {
      setChatInput('');
    });
  };

  // Add video to queue
  const handleAddVideo = (e) => {
    e.preventDefault();
    if (!videoInput.trim()) return;
    socket.emit('add_video', { lobbyId, url: videoInput }, (res) => {
      if (res.error) setError(res.error);
      else setVideoInput('');
    });
  };

  // Like/dislike current video (optimistic UI)
  const handleLike = () => {
    if (!queue[0]) return;
    if (myLike === 'like') {
      // Undo like
      setQueue(q => [{
        ...q[0],
        likes: q[0].likes - 1,
        likedBy: q[0].likedBy.filter(id => id !== mySocketId),
      }, ...q.slice(1)]);
      setMyLike(null);
      socket.emit('like_video', { lobbyId, undo: true });
    } else {
      // Like (and remove dislike if present)
      setQueue(q => [{
        ...q[0],
        likes: q[0].likedBy && q[0].likedBy.includes(mySocketId) ? q[0].likes : q[0].likes + 1,
        likedBy: [...(q[0].likedBy || []).filter(id => id !== mySocketId), mySocketId],
        dislikes: q[0].dislikedBy && q[0].dislikedBy.includes(mySocketId) ? q[0].dislikes - 1 : q[0].dislikes,
        dislikedBy: (q[0].dislikedBy || []).filter(id => id !== mySocketId),
      }, ...q.slice(1)]);
      setMyLike('like');
      socket.emit('like_video', { lobbyId });
    }
  };
  const handleDislike = () => {
    if (!queue[0]) return;
    if (myLike === 'dislike') {
      // Undo dislike
      setQueue(q => [{
        ...q[0],
        dislikes: q[0].dislikes - 1,
        dislikedBy: q[0].dislikedBy.filter(id => id !== mySocketId),
      }, ...q.slice(1)]);
      setMyLike(null);
      socket.emit('dislike_video', { lobbyId, undo: true });
    } else {
      // Dislike (and remove like if present)
      setQueue(q => [{
        ...q[0],
        dislikes: q[0].dislikedBy && q[0].dislikedBy.includes(mySocketId) ? q[0].dislikes : q[0].dislikes + 1,
        dislikedBy: [...(q[0].dislikedBy || []).filter(id => id !== mySocketId), mySocketId],
        likes: q[0].likedBy && q[0].likedBy.includes(mySocketId) ? q[0].likes - 1 : q[0].likes,
        likedBy: (q[0].likedBy || []).filter(id => id !== mySocketId),
      }, ...q.slice(1)]);
      setMyLike('dislike');
      socket.emit('dislike_video', { lobbyId });
    }
  };

  // Host controls
  const handleSkip = () => {
    socket.emit('skip_video', { lobbyId }, (res) => {
      if (res && res.error) setError(res.error);
    });
  };
  const handleDelete = (index) => {
    socket.emit('delete_video', { lobbyId, index }, (res) => {
      if (res && res.error) setError(res.error);
    });
  };
  const handleKick = (userSocketId) => {
    socket.emit('kick_user', { lobbyId, userSocketId }, (res) => {
      if (res && res.error) setError(res.error);
    });
  };
  const handleBan = (userSocketId) => {
    socket.emit('ban_user', { lobbyId, userSocketId }, (res) => {
      if (res && res.error) setError(res.error);
    });
  };
  const handleTransferHost = (newHostSocketId) => {
    socket.emit('transfer_host', { lobbyId, newHostSocketId }, (res) => {
      if (res && res.error) setError(res.error);
    });
  };

  // Host emits sync events
  const handlePlay = (e) => {
    if (isHost && player) {
      const time = player.getCurrentTime();
      socket.emit('sync_play', { lobbyId, time });
    }
  };
  const handlePause = (e) => {
    if (isHost && player) {
      const time = player.getCurrentTime();
      socket.emit('sync_pause', { lobbyId, time });
    }
  };
  const handleEnd = (e) => {
    if (isHost && player) {
      socket.emit('sync_end', { lobbyId });
    }
  };

  // Extract YouTube video ID from URL
  function getYouTubeId(url) {
    const match = url.match(/(?:v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
    return match ? match[1] : null;
  }

  useEffect(() => {
    if (!isHost || !player) return;
    const handleRequestHostSync = ({ requester }) => {
      const time = player.getCurrentTime();
      const state = player.getPlayerState() === 1 ? 'playing' : 'paused';
      socket.emit('host_sync', { lobbyId, requester, time, state });
    };
    socket.on('request_host_sync', handleRequestHostSync);
    return () => {
      socket.off('request_host_sync', handleRequestHostSync);
    };
  }, [isHost, player, lobbyId]);

  // Persist dark mode preference
  useEffect(() => {
    const stored = localStorage.getItem('radio_dark_mode');
    if (stored !== null) setDarkMode(stored === 'true');
  }, []);
  useEffect(() => {
    localStorage.setItem('radio_dark_mode', darkMode);
  }, [darkMode]);

  // Fetch YouTube video meta for queue
  useEffect(() => {
    async function fetchMeta(url) {
      const id = getYouTubeId(url);
      if (!id || videoMeta[url]) return;
      try {
        // Use oEmbed for title/thumbnail (no API key needed)
        const { data } = await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
        setVideoMeta(meta => ({ ...meta, [url]: { title: data.title, thumbnail: data.thumbnail_url } }));
      } catch {
        setVideoMeta(meta => ({ ...meta, [url]: { title: 'Unknown Title', thumbnail: '' } }));
      }
    }
    queue.forEach(v => fetchMeta(v.url));
    // eslint-disable-next-line
  }, [queue]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {step === 'welcome' ? (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1 }}>
          <Paper elevation={6} sx={{ p: 4, width: 360 }}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
              <Tooltip title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
                <IconButton onClick={() => setDarkMode(m => !m)}>
                  {darkMode ? <LightMode /> : <DarkMode />}
                </IconButton>
              </Tooltip>
            </Box>
            <Typography variant="h4" align="center" gutterBottom>Radio Party</Typography>
            <TextField
              label="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              fullWidth
              sx={{ mb: 2 }}
            />
            <Button variant="contained" color="primary" fullWidth sx={{ mb: 2 }} onClick={handleCreateLobby}>
              Create Lobby
            </Button>
            <Divider sx={{ my: 2 }}>or</Divider>
            <TextField
              label="Lobby ID"
              value={lobbyId}
              onChange={e => setLobbyId(e.target.value)}
              fullWidth
              sx={{ mb: 2 }}
            />
            <Button variant="outlined" color="primary" fullWidth onClick={handleJoinLobby}>
              Join Lobby
            </Button>
            {error && <Typography color="error" sx={{ mt: 2 }}>{error}</Typography>}
          </Paper>
        </Box>
      ) : step === 'lobby' ? (
        <Box sx={{ minHeight: '100vh', height: '100vh', bgcolor: 'background.default', position: 'relative', overflow: 'hidden', px: { xs: 1, sm: 1, md: 2 }, pt: { xs: '66px', md: '74px' }, pb: '10px', boxSizing: 'border-box' }}>
          <AppBar position="fixed" color="primary" elevation={2}>
            <Toolbar>
              <Typography variant="h6" sx={{ flexGrow: 1 }}>Radio Party - Lobby {lobbyId}</Typography>
              <Tooltip title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
                <IconButton color="inherit" onClick={() => setDarkMode(m => !m)}>
                  {darkMode ? <LightMode /> : <DarkMode />}
                </IconButton>
              </Tooltip>
              <Typography variant="body1" sx={{ ml: 2 }}>Welcome, {name}</Typography>
              <IconButton color="inherit" sx={{ ml: 2 }} onClick={() => setStep('welcome')}><Logout /></IconButton>
            </Toolbar>
          </AppBar>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              alignItems: 'stretch',
              minHeight: 0,
              gap: '10px',
              width: '100%',
              boxSizing: 'border-box',
              height: '100%',
            }}
          >
            {/* Video Queue (left or top on mobile) */}
            <Paper elevation={2} sx={{
              width: { xs: '100%', md: 260 },
              minWidth: 180,
              maxWidth: 340,
              p: 2,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              height: { md: 'auto', xs: 'auto' },
              zIndex: 10,
              bgcolor: 'background.paper',
              m: 0,
            }}>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>Video Queue</Typography>
              <Box component="form" onSubmit={handleAddVideo} sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <TextField
                  value={videoInput}
                  onChange={e => setVideoInput(e.target.value)}
                  placeholder="YouTube URL"
                  size="small"
                  fullWidth
                />
                <Button type="submit" variant="contained">Add</Button>
              </Box>
              {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
              {queue.length === 0 ? (
                <Typography color="text.secondary">No videos in queue.</Typography>
              ) : (
                <List sx={{ p: 0, maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }} className="custom-scroll">
                  {queue.map((video, i) => {
                    const meta = videoMeta[video.url] || {};
                    const isNowPlaying = i === 0;
                    return (
                      <ListItem key={i} sx={{
                        mb: 1,
                        bgcolor: isNowPlaying ? (theme.palette.mode === 'dark' ? 'primary.dark' : 'primary.light') : (theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100'),
                        borderRadius: 2,
                        boxShadow: isNowPlaying ? 2 : 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        p: 1.5,
                      }}
                      secondaryAction={isHost && (
                        <Box>
                          {isNowPlaying && <Tooltip title="Skip"><IconButton onClick={handleSkip}><SkipNext /></IconButton></Tooltip>}
                          <Tooltip title="Delete"><IconButton onClick={() => handleDelete(i)}><Delete /></IconButton></Tooltip>
                        </Box>
                      )}
                      >
                        {meta.thumbnail && (
                          <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center', mb: 1 }}>
                            <img src={meta.thumbnail} alt={meta.title} style={{ width: '100%', maxWidth: 220, borderRadius: 8 }} />
                          </Box>
                        )}
                        <Typography variant={isNowPlaying ? 'h6' : 'subtitle2'} fontWeight={isNowPlaying ? 'bold' : 'normal'} sx={{ mb: 0.5, color: isNowPlaying ? 'primary.contrastText' : 'text.primary', width: '100%', wordBreak: 'break-word' }}>
                          {meta.title || (isNowPlaying ? 'Now Playing' : 'Queued Video')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ width: '100%', wordBreak: 'break-all', mb: 0.5 }}>{video.url}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">Added by: {video.addedBy}</Typography>
                          <Tooltip title={video.likedByNames && video.likedByNames.length ? 'Liked by: ' + video.likedByNames.join(', ') : 'No likes'}>
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                cursor: isNowPlaying ? 'pointer' : 'default',
                                color: isNowPlaying
                                  ? (myLike === 'like' ? 'primary.main' : 'text.secondary')
                                  : 'text.secondary',
                                '&:hover': isNowPlaying ? { color: 'primary.light' } : {},
                                fontWeight: myLike === 'like' && isNowPlaying ? 'bold' : 'normal',
                              }}
                              onClick={isNowPlaying ? handleLike : undefined}
                            >
                              <ThumbUp fontSize="small" sx={{ mr: 0.5 }} /> {video.likes}
                            </Box>
                          </Tooltip>
                          <Tooltip title={video.dislikedByNames && video.dislikedByNames.length ? 'Disliked by: ' + video.dislikedByNames.join(', ') : 'No dislikes'}>
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                cursor: isNowPlaying ? 'pointer' : 'default',
                                color: isNowPlaying
                                  ? (myLike === 'dislike' ? 'error.main' : 'text.secondary')
                                  : 'text.secondary',
                                '&:hover': isNowPlaying ? { color: 'error.light' } : {},
                                fontWeight: myLike === 'dislike' && isNowPlaying ? 'bold' : 'normal',
                              }}
                              onClick={isNowPlaying ? handleDislike : undefined}
                            >
                              <ThumbDown fontSize="small" sx={{ mr: 0.5 }} /> {video.dislikes}
                            </Box>
                          </Tooltip>
                        </Box>
                      </ListItem>
                    );
                  })}
                </List>
              )}
            </Paper>
            {/* Video Player (top) */}
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: '10px',
                m: 0,
              }}
            >
              <Box
                ref={videoContainerRef}
                sx={{
                  width: '100%',
                  maxWidth: { xs: 1100, lg: 1400 },
                  aspectRatio: '16/10',
                  mb: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 220,
                  flexGrow: 1,
                  mx: 'auto',
                }}
              >
                <Paper elevation={3} sx={{ width: '100%', height: '100%', bgcolor: darkMode ? '#111' : '#f5f5f5', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 0, overflow: 'hidden' }}>
                  {queue[0] && getYouTubeId(queue[0].url) ? (
                    <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <YouTube
                        videoId={getYouTubeId(queue[0].url)}
                        opts={{ width: '100%', height: '100%', playerVars: { autoplay: 1 } }}
                        style={{ width: '100%', height: '100%', flex: 1 }}
                        iframeClassName="yt-iframe-stretch"
                        onReady={e => setPlayer(e.target)}
                        onPlay={handlePlay}
                        onPause={handlePause}
                        onEnd={handleEnd}
                      />
                    </Box>
                  ) : (
                    <Box sx={{ width: '100%', height: '100%', bgcolor: darkMode ? '#222' : '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', color: darkMode ? '#fff' : '#222' }}>
                      No video playing
                    </Box>
                  )}
                </Paper>
              </Box>
            </Box>
            {/* Chat Bar (right) */}
            <Paper
              elevation={2}
              sx={{
                width: { xs: '100%', md: 340 },
                minWidth: 200,
                maxWidth: 400,
                p: 0,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                height: { md: 'auto', xs: 'auto' },
                zIndex: 10,
                bgcolor: 'background.paper',
                ml: { md: 0, xs: 0 },
                mr: { md: 0, xs: 0 },
                mt: { xs: 0, md: 0 },
                mb: { xs: 0, md: 0 },
              }}
            >
              {/* Tabs for Chat/Users */}
              <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} variant="fullWidth" sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tab label="Chat" />
                <Tab label="Users" />
              </Tabs>
              {/* Tab Panels */}
              {tabValue === 0 && (
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2, height: '100%' }}>
                  <Box sx={{ flex: 1, overflowY: 'auto', mb: 1 }}>
                    <Box className="custom-scroll" sx={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', height: '100%' }}>
                      {messages.map((msg, i) => (
                        <Box key={i} sx={{ my: 0.5, color: msg.user === 'System' ? 'grey.600' : 'text.primary' }}>
                          <Typography component="span" fontWeight={msg.user === 'System' ? 'bold' : 'normal'}>{msg.user}:</Typography> {msg.message}
                        </Box>
                      ))}
                      <div ref={chatEndRef} />
                    </Box>
                  </Box>
                  <Box component="form" onSubmit={handleSendMessage} sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <TextField
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      placeholder="Type a message..."
                      size="small"
                      fullWidth
                    />
                    <Button type="submit" variant="contained">Send</Button>
                  </Box>
                </Box>
              )}
              {tabValue === 1 && (
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2, height: '100%' }}>
                  <List dense sx={{ flex: 1, overflowY: 'auto' }}>
                    {mySocketId && users.length > 0 ? (
                      users.map((u, i) => (
                        <ListItem key={i}
                          secondaryAction={isHost && u.socketId !== mySocketId && (
                            <Box>
                              <Tooltip title="Kick"><IconButton onClick={() => handleKick(u.socketId)}><Block /></IconButton></Tooltip>
                              <Tooltip title="Ban"><IconButton onClick={() => handleBan(u.socketId)}><Star /></IconButton></Tooltip>
                            </Box>
                          )}
                          sx={u.socketId === mySocketId ? { bgcolor: 'primary.lighter', borderRadius: 2 } : {}}
                        >
                          <ListItemAvatar>
                            <Avatar sx={{ bgcolor: u.isHost ? 'primary.main' : 'grey.500' }}>
                              {u.isHost ? <SupervisorAccount /> : <Person />}
                            </Avatar>
                          </ListItemAvatar>
                          <ListItemText
                            primary={<>
                              {u.name} {u.socketId === mySocketId && <Typography component="span" color="primary" fontWeight="bold">(You)</Typography>} {u.isHost && <Typography component="span" color="primary">(Host)</Typography>}
                            </>}
                            primaryTypographyProps={{ fontWeight: u.isHost ? 'bold' : 'normal' }}
                          />
                        </ListItem>
                      ))
                    ) : (
                      <ListItem>
                        <ListItemText primary="Loading users..." />
                      </ListItem>
                    )}
                  </List>
                  {isHost && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="caption">Transfer Host:</Typography>
                      <Select
                        size="small"
                        defaultValue=""
                        displayEmpty
                        onChange={e => handleTransferHost(e.target.value)}
                        sx={{ ml: 1, minWidth: 120 }}
                      >
                        <MenuItem value="" disabled>Select user</MenuItem>
                        {users.filter(u => !u.isHost).map(u => (
                          <MenuItem key={u.socketId} value={u.socketId}>{u.name}</MenuItem>
                        ))}
                      </Select>
                    </Box>
                  )}
                </Box>
              )}
            </Paper>
          </Box>
        </Box>
      ) : null}
    </ThemeProvider>
  );
}

export default App;
