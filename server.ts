import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  // Game State Management
  const rooms = new Map();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join_room", ({ roomId, playerName }) => {
      socket.join(roomId);
      
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          id: roomId,
          players: [],
          gameState: "waiting", // waiting, playing, finished
          deck: [],
          currentTurn: 0,
          scores: { team1: 0, team2: 0 },
          roundPoints: 1,
          cardsOnTable: [],
          manilha: null,
          vira: null,
          rounds: [], // track sub-rounds (melhor de 3)
        });
      }

      const room = rooms.get(roomId);
      
      // Check if player already in room (reconnection logic simplified)
      const existingPlayer = room.players.find(p => p.id === socket.id);
      if (!existingPlayer && room.players.length < 4) {
        const team = room.players.length % 2 === 0 ? 1 : 2;
        room.players.push({
          id: socket.id,
          name: playerName,
          team,
          cards: [],
          ready: false,
        });
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

      // Move turn
      room.currentTurn = (room.currentTurn + 1) % room.players.length;

      // Check if everyone played this sub-round
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
        // Team that refused loses the round
        const refuser = room.players.find(p => p.id === socket.id);
        const winnerTeam = refuser.team === 1 ? 2 : 1;
        endRound(room, winnerTeam, roomId);
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      // Handle cleanup if needed
    });
  });

  function startNewRound(room) {
    const deck = createDeck();
    shuffle(deck);
    
    room.vira = deck.pop();
    room.manilha = getManilha(room.vira);
    room.roundPoints = 1;
    room.cardsOnTable = [];
    room.rounds = [];
    
    room.players.forEach(player => {
      player.cards = [deck.pop(), deck.pop(), deck.pop()];
    });
  }

  function resolveSubRound(room, roomId) {
    // Logic to determine who won the sub-round
    const winner = determineWinner(room.cardsOnTable, room.manilha);
    room.rounds.push(winner.team);
    room.cardsOnTable = [];

    // Set next turn to the winner
    const winnerPlayerIndex = room.players.findIndex(p => p.id === winner.playerId);
    room.currentTurn = winnerPlayerIndex;

    // Check if round ended (best of 3)
    const team1Wins = room.rounds.filter(r => r === 1).length;
    const team2Wins = room.rounds.filter(r => r === 2).length;

    if (team1Wins === 2) {
      endRound(room, 1, roomId);
    } else if (team2Wins === 2) {
      endRound(room, 2, roomId);
    } else if (room.rounds.length === 3) {
      // Tie-break logic simplified
      endRound(room, team1Wins > team2Wins ? 1 : 2, roomId);
    } else {
      io.to(roomId).emit("room_update", room);
    }
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

  // Helper functions
  function createDeck() {
    const suits = ["hearts", "diamonds", "clubs", "spades"];
    const values = ["4", "5", "6", "7", "Q", "J", "K", "A", "2", "3"];
    const deck = [];
    for (const suit of suits) {
      for (const value of values) {
        deck.push({ value, suit });
      }
    }
    return deck;
  }

  function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  function getManilha(vira) {
    const values = ["4", "5", "6", "7", "Q", "J", "K", "A", "2", "3"];
    const viraIndex = values.indexOf(vira.value);
    return values[(viraIndex + 1) % values.length];
  }

  function determineWinner(playedCards, manilhaValue) {
    const valueOrder = ["4", "5", "6", "7", "Q", "J", "K", "A", "2", "3"];
    const suitOrder = ["diamonds", "spades", "hearts", "clubs"]; // For manilhas

    let bestCard = playedCards[0];

    for (let i = 1; i < playedCards.length; i++) {
      const current = playedCards[i];
      const isCurrentManilha = current.card.value === manilhaValue;
      const isBestManilha = bestCard.card.value === manilhaValue;

      if (isCurrentManilha && !isBestManilha) {
        bestCard = current;
      } else if (isCurrentManilha && isBestManilha) {
        if (suitOrder.indexOf(current.card.suit) > suitOrder.indexOf(bestCard.card.suit)) {
          bestCard = current;
        }
      } else if (!isCurrentManilha && !isBestManilha) {
        if (valueOrder.indexOf(current.card.value) > valueOrder.indexOf(bestCard.card.value)) {
          bestCard = current;
        }
      }
    }
    return bestCard;
  }

  // Vite Integration
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

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
