# Radio

Radio is a modern web app for synchronized YouTube video watching with friends. Create or join lobbies, queue up videos, chat, and enjoy robust moderation and a sleek, responsive UI.

## Features

- **Lobby System:** Create or join lobbies with a unique ID.
- **Synchronized Playback:** Host controls YouTube playback for all users; new users sync instantly.
- **Video Queue:** Add YouTube URLs, see video titles/thumbnails, reorder by likes/dislikes and active users.
- **Like/Dislike System:** Like/dislike the current video (with instant feedback, toggleable), affecting queue order.
- **Tabbed Chat/Users Panel:** Easily switch between chat and user list in a modern tabbed interface.
- **Chat:** Real-time chat with all users in the lobby.
- **User List:** See all users, with host/admin status and your own user highlighted. Host can transfer host role from the Users tab.
- **Host Moderation:** Host can skip/delete videos, kick/ban users, and transfer host role.
- **Modern UI:** Responsive layout, dark/light mode toggle, custom scrollbars, maximized video player, and consistent 10px spacing between all elements.
- **Mobile Friendly:** Layout adapts for phones and small screens, stacking elements vertically for best usability.
- **Robust Sync:** Handles disconnects, reconnects, and joining mid-playback smoothly.

## Setup

### Prerequisites
- Node.js (v16+ recommended)
- npm

### 1. Clone the repository
```
git clone https://github.com/Fawness/radio
cd Radio
```

### 2. Install dependencies
#### Backend
```
cd server
npm install
```
#### Frontend
```
cd ../client
npm install
```

### 3. Run the app
#### Start the backend server
```
cd ../server
npm start
```
The backend runs on [http://localhost:4000](http://localhost:4000)

#### Start the frontend
```
cd ../client
npm start
```
The frontend runs on [http://localhost:3000](http://localhost:3000)

## Usage
- Open the frontend in your browser.
- Enter your name and create or join a lobby.
- Add YouTube video URLs to the queue.
- Like/dislike the current video to affect queue order (click again to undo).
- Use the right-side tab panel to switch between chat and user list.
- Chat with friends, see who's in the lobby, and enjoy synchronized playback.
- If you are the host, use moderation controls for a smooth experience.

## Tech Stack
- **Frontend:** React, Material-UI, react-youtube, Socket.IO client
- **Backend:** Node.js, Express, Socket.IO

---

Enjoy your YouTube party!
