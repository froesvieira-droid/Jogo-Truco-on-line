import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { createServer as createViteServer } from "vite";
import { startNewRound, determineWinner } from "./src/lib/gameLogic.js";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  
  // Configuração do Socket.io
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    allowEIO3: true,
    transports: ['polling', 'websocket']
  });

  const PORT = 3000;

  // 1. MIDDLEWARES BÁSICOS
  app.use(express.json());

  // 2. ROTAS DE API (PRIORIDADE MÁXIMA)
  app.get("/api/health", (req, res) => {
    res.send("OK");
  });

  // Game State Management
  const rooms = new Map();
  const socketToPlayer = new Map();

  io.on("connection", (socket) => {
    console.log("Novo jogador conectado:", socket.id);

    socket.on("join_room", ({ roomId, playerName }) => {
      console.log(`Jogador ${playerName} entrando na sala ${roomId}`);
      socket.join(roomId);
      
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          id: roomId,
          players: [],
          gameState: "waiting",
          deck: [],
          currentTurn: 0,
          scores: { team1: 0, team2: 0 },
          roundPoints: 1,
          cardsOnTable: [],
          manilha: null,
          vira: null,
          rounds: [],
          messages: [],
        });
      }

      const room = rooms.get(roomId);
      socketToPlayer.set(socket.id, { roomId, playerName });
      
      const existingPlayer = room.players.find(p => p.id === socket.id);
      if (!existingPlayer && room.players.length < 4) {
        const team = room.players.length % 2 === 0 ? 1 : 2;
        room.players.push({
          id: socket.id,
          name: playerName,
          team,
          cards: [],
          ready: false,
          connected: true,
        });
      } else if (existingPlayer) {
        existingPlayer.connected = true;
      }

      io.to(roomId).emit("room_update", room);
    });

    socket.on("start_game", (roomId) => {
      const room = rooms.get(roomId);
      if (room && room.players.length >= 2) {
        room.gameState = "playing";
        startNewRound(room);
        io.to(roomId).emit("room_update", room);
      }
    });

    socket.on("play_card", ({ roomId, cardIndex }) => {
      const room = rooms.get(roomId);
      if (!room || room.gameState !== "playing") return;

      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== room.currentTurn) return;

      const player = room.players[playerIndex];
      const card = player.cards.splice(cardIndex, 1)[0];
      
      room.cardsOnTable.push({
        playerId: socket.id,
        playerName: player.name,
        team: player.team,
        card
      });

      room.currentTurn = (room.currentTurn + 1) % room.players.length;

      if (room.cardsOnTable.length === room.players.length) {
        resolveSubRound(room, roomId);
      } else {
        io.to(roomId).emit("room_update", room);
      }
    });

    socket.on("truco_request", ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      const player = room.players.find(p => p.id === socket.id);
      const nextPoints = room.roundPoints === 1 ? 3 : room.roundPoints + 3;
      if (nextPoints > 12) return;

      io.to(roomId).emit("truco_called", {
        callerId: socket.id,
        callerName: player.name,
        nextPoints
      });
    });

    socket.on("truco_response", ({ roomId, accepted }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      if (accepted) {
        room.roundPoints = room.roundPoints === 1 ? 3 : room.roundPoints + 3;
        io.to(roomId).emit("room_update", room);
      } else {
        const refuser = room.players.find(p => p.id === socket.id);
        const winnerTeam = refuser.team === 1 ? 2 : 1;
        endRound(room, winnerTeam, roomId);
      }
    });

    socket.on("send_message", ({ roomId, text }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      const message = {
        id: Math.random().toString(36).substring(2, 9),
        senderId: socket.id,
        senderName: player.name,
        text,
        timestamp: Date.now(),
      };

      room.messages.push(message);
      if (room.messages.length > 50) {
        room.messages.shift();
      }

      io.to(roomId).emit("room_update", room);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      const playerInfo = socketToPlayer.get(socket.id);
      if (playerInfo) {
        const { roomId } = playerInfo;
        const room = rooms.get(roomId);
        if (room) {
          const player = room.players.find(p => p.id === socket.id);
          if (player) {
            player.connected = false;
            io.to(roomId).emit("room_update", room);
          }
        }
        socketToPlayer.delete(socket.id);
      }
    });
  });

  function resolveSubRound(room, roomId) {
    const winner = determineWinner(room.cardsOnTable, room.manilha);
    room.rounds.push(winner.team);
    room.cardsOnTable = [];
    const winnerPlayerIndex = room.players.findIndex(p => p.id === winner.playerId);
    room.currentTurn = winnerPlayerIndex;

    const team1Wins = room.rounds.filter(r => r === 1).length;
    const team2Wins = room.rounds.filter(r => r === 2).length;

    if (team1Wins === 2) endRound(room, 1, roomId);
    else if (team2Wins === 2) endRound(room, 2, roomId);
    else if (room.rounds.length === 3) endRound(room, team1Wins > team2Wins ? 1 : 2, roomId);
    else io.to(roomId).emit("room_update", room);
  }

  function endRound(room, winnerTeam, roomId) {
    if (winnerTeam === 1) room.scores.team1 += room.roundPoints;
    else room.scores.team2 += room.roundPoints;

    if (room.scores.team1 >= 12 || room.scores.team2 >= 12) {
      room.gameState = "finished";
    } else {
      startNewRound(room);
    }
    io.to(roomId).emit("room_update", room);
  }

  // 3. INTEGRAÇÃO COM VITE / ARQUIVOS ESTÁTICOS
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // 4. INICIALIZAÇÃO DO SERVIDOR
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`>>> SERVIDOR TRUCO ONLINE EM http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("!!! FALHA CRÍTICA AO INICIAR SERVIDOR:", err);
});
