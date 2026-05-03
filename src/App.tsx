/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Room, Player, Card as CardType } from './types';
import { Card } from './components/Card';
import { cn } from './utils';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { Trophy, Users, Play, LogOut, MessageSquare, ShieldAlert, Send, X, Cpu, Share2, Copy, Check } from 'lucide-react';
import { createDeck, shuffle, getManilha, determineWinner, startNewRound } from './lib/gameLogic';

const socket: Socket = io({
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  autoConnect: true,
});

export default function App() {
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || 'sala-truco';
  });
  const [joined, setJoined] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [trucoCall, setTrucoCall] = useState<{ callerId?: string; callerName: string; nextPoints: number } | null>(null);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [lastError, setLastError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [copied, setCopied] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [room?.messages, chatOpen]);

  useEffect(() => {
    if (isOffline && room && room.gameState === "playing" && !trucoCall) {
      const currentPlayer = room.players[room.currentTurn];
      if (currentPlayer.id.startsWith("bot-")) {
        const timeout = setTimeout(() => {
          // 8% chance of bot calling truco if score is low and it's early in round
          if (Math.random() < 0.08 && room.roundPoints < 12 && room.rounds.length < 2) {
            setTrucoCall({ 
              callerId: currentPlayer.id, 
              callerName: currentPlayer.name, 
              nextPoints: room.roundPoints === 1 ? 3 : room.roundPoints + 3 
            });
            return;
          }

          const cardIndex = Math.floor(Math.random() * currentPlayer.cards.length);
          playLocalCard(cardIndex);
        }, 1500);
        return () => clearTimeout(timeout);
      }
    }
  }, [isOffline, room?.currentTurn, room?.gameState, trucoCall]);

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
      setLastError(null);
      console.log('Conectado ao servidor de Truco');
    }

    function onDisconnect(reason: string) {
      setIsConnected(false);
      setLastError(`Desconectado: ${reason}`);
      console.log('Desconectado do servidor:', reason);
    }

    function onConnectError(err: any) {
      console.error('Erro de conexão:', err);
      setLastError(`Erro de conexão: ${err.message}`);
      setIsConnected(false);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    socket.on('room_update', (updatedRoom: Room) => {
      console.log('Atualização da sala recebida:', updatedRoom);
      setRoom(updatedRoom);
      if (updatedRoom.gameState === 'finished') {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
    });

    socket.on('truco_called', (data) => {
      setTrucoCall(data);
    });

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('room_update');
      socket.off('truco_called');
    };
  }, []);

  const handleJoin = () => {
    if (playerName.trim()) {
      setIsOffline(false);
      socket.emit('join_room', { roomId, playerName });
      setJoined(true);
    }
  };

  const handleOfflineStart = () => {
    setIsOffline(true);
    setJoined(true);
    const pName = playerName.trim() || 'Você';
    setPlayerName(pName);
    
    const initialRoom: Room = {
      id: 'offline-room',
      players: [
        { id: 'player-1', name: pName, team: 1, cards: [], ready: true, connected: true },
        { id: 'bot-1', name: 'Bot 1', team: 2, cards: [], ready: true, connected: true },
        { id: 'bot-2', name: 'Bot 2', team: 1, cards: [], ready: true, connected: true },
        { id: 'bot-3', name: 'Bot 3', team: 2, cards: [], ready: true, connected: true },
      ],
      gameState: 'playing',
      currentTurn: 0,
      scores: { team1: 0, team2: 0 },
      roundPoints: 1,
      cardsOnTable: [],
      manilha: null,
      vira: null,
      rounds: [],
      messages: []
    };
    
    startNewRound(initialRoom);
    setRoom(initialRoom);
  };

  const handleStart = () => {
    if (isOffline) {
      if (room) {
        const nextRoom = { ...room, gameState: 'playing' as const };
        startNewRound(nextRoom);
        setRoom(nextRoom);
      }
    } else {
      socket.emit('start_game', roomId);
    }
  };

  const handlePlayCard = (index: number) => {
    if (isOffline) {
      if (!room || room.gameState !== 'playing') return;
      const player = room.players[room.currentTurn];
      if (player.id !== 'player-1') return; // Not user's turn

      playLocalCard(index);
    } else {
      socket.emit('play_card', { roomId, cardIndex: index });
    }
  };

  const playLocalCard = (cardIndex: number) => {
    if (!room) return;
    const newRoom = { ...room };
    const player = newRoom.players[newRoom.currentTurn];
    const card = player.cards.splice(cardIndex, 1)[0];
    
    newRoom.cardsOnTable.push({
      playerId: player.id,
      playerName: player.name,
      team: player.team,
      card
    });

    newRoom.currentTurn = (newRoom.currentTurn + 1) % newRoom.players.length;

    if (newRoom.cardsOnTable.length === newRoom.players.length) {
      setTimeout(() => resolveLocalSubRound(newRoom), 1000);
    }
    setRoom(newRoom);
  };

  const resolveLocalSubRound = (currentRoom: Room) => {
    const winner = determineWinner(currentRoom.cardsOnTable, currentRoom.manilha!);
    currentRoom.rounds.push(winner.team);
    currentRoom.cardsOnTable = [];
    const winnerPlayerIndex = currentRoom.players.findIndex(p => p.id === winner.playerId);
    currentRoom.currentTurn = winnerPlayerIndex;

    const team1Wins = currentRoom.rounds.filter(r => r === 1).length;
    const team2Wins = currentRoom.rounds.filter(r => r === 2).length;

    if (team1Wins === 2) endLocalRound(currentRoom, 1);
    else if (team2Wins === 2) endLocalRound(currentRoom, 2);
    else if (currentRoom.rounds.length === 3) endLocalRound(currentRoom, team1Wins > team2Wins ? 1 : 2);
    else setRoom({ ...currentRoom });
  };

  const endLocalRound = (currentRoom: Room, winnerTeam: 1 | 2) => {
    if (winnerTeam === 1) currentRoom.scores.team1 += currentRoom.roundPoints;
    else currentRoom.scores.team2 += currentRoom.roundPoints;

    if (currentRoom.scores.team1 >= 12 || currentRoom.scores.team2 >= 12) {
      currentRoom.gameState = 'finished';
      if (currentRoom.scores.team1 >= 12 && isOffline) {
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      }
    } else {
      startNewRound(currentRoom);
    }
    setRoom({ ...currentRoom });
  };

  const handleTruco = () => {
    if (isOffline) {
      // User calling truco
      setTrucoCall({ callerId: 'player-1', callerName: playerName, nextPoints: room?.roundPoints === 1 ? 3 : (room?.roundPoints || 0) + 3 });
      
      // Simulate bots thinking and accepting
      setTimeout(() => {
        handleTrucoResponse(true);
      }, 1500);
    } else {
      socket.emit('truco_request', { roomId });
    }
  };

  const handleTrucoResponse = (accepted: boolean) => {
    if (isOffline && room) {
      const nextRoom = { ...room };
      if (accepted) {
        nextRoom.roundPoints = nextRoom.roundPoints === 1 ? 3 : nextRoom.roundPoints + 3;
        setRoom(nextRoom);
      } else {
        // If user refused bot's call, bots win
        // If bot refused user's call, user team wins
        const loserId = trucoCall?.callerId === 'player-1' ? 'bot' : 'player-1'; 
        // Simple: if user says "Correr", bots get the points. If bots (eventually) say "Correr", user gets the points.
        // Since bots currently always accept user calls, if we are here and accepted is false, it means USER refused bot call.
        const winnerTeam = (trucoCall?.callerId?.startsWith('bot')) ? (myTeam === 1 ? 2 : 1) : myTeam;
        
        // Wait, logic check: if caller was bot-1 (team 2) and user refused, team 2 should win.
        const caller = room.players.find(p => p.id === trucoCall?.callerId);
        const winTeam = caller?.team || (myTeam === 1 ? 2 : 1);
        
        endLocalRound(nextRoom, winTeam as 1 | 2);
      }
      setTrucoCall(null);
    } else {
      socket.emit('truco_response', { roomId, accepted });
      setTrucoCall(null);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (messageText.trim()) {
      socket.emit('send_message', { roomId, text: messageText });
      setMessageText('');
    }
  };

  const handleCopyLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    const shareData = {
      title: 'Truco Online',
      text: 'Vem jogar Truco comigo!',
      url: url.toString()
    };

    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url.toString());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        await navigator.clipboard.writeText(url.toString());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  if (!joined) {
    return (
      <div className="min-h-screen bg-emerald-900 flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 w-full max-w-md shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="relative">
              <div className="w-20 h-20 bg-yellow-500 rounded-full flex items-center justify-center mb-4 shadow-lg">
                <Trophy className="text-white w-10 h-10" />
              </div>
              <div className={cn(
                "absolute bottom-4 right-0 w-5 h-5 rounded-full border-4 border-emerald-900 shadow-sm",
                isConnected ? "bg-green-500" : "bg-red-500 animate-pulse"
              )} title={isConnected ? "Conectado" : "Desconectado"} />
            </div>
            <h1 className="text-4xl font-black text-white tracking-tighter uppercase italic">Truco Online</h1>
            <p className="text-emerald-200 text-sm mt-2">
              {isConnected ? "O servidor está online" : "Servidor offline (Jogue vs CPU)"}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-emerald-300 uppercase tracking-widest mb-1 ml-1">Seu Nome</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Ex: João"
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-emerald-300 uppercase tracking-widest mb-1 ml-1">ID da Sala</label>
              <div className="relative">
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-all pr-12"
                />
                <button 
                  onClick={handleCopyLink}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-lg transition-all text-emerald-300"
                  title="Copiar link de convite"
                >
                  {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <button
              onClick={handleJoin}
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-emerald-950 font-black py-4 rounded-xl transition-all shadow-lg active:scale-95 uppercase tracking-tighter text-lg"
            >
              Entrar na Mesa
            </button>

            <button
              onClick={handleOfflineStart}
              className="w-full bg-white/10 hover:bg-white/20 text-white font-black py-4 rounded-xl transition-all border border-white/10 active:scale-95 uppercase tracking-tighter text-lg flex items-center justify-center gap-2"
            >
              <Cpu className="w-5 h-5" /> Modo Offline
            </button>

            <button 
              onClick={() => setShowDebug(!showDebug)}
              className="w-full text-[10px] text-white/30 uppercase tracking-widest hover:text-white transition-colors mt-4"
            >
              {showDebug ? "Ocultar Diagnóstico" : "Ver Diagnóstico do Servidor"}
            </button>

            {showDebug && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-4 p-4 bg-black/40 rounded-xl border border-white/10 text-[10px] font-mono space-y-1"
              >
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className={isConnected ? "text-green-400" : "text-red-400"}>
                    {isConnected ? "CONECTADO" : "DESCONECTADO"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Socket ID:</span>
                  <span className="text-white/60">{socket.id || "---"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Transporte:</span>
                  <span className="text-white/60">{socket.io?.engine?.transport?.name || "---"}</span>
                </div>
                <div className="flex flex-col gap-1 mt-2">
                  <button 
                    onClick={() => {
                      socket.disconnect();
                      socket.connect();
                    }}
                    className="w-full bg-white/10 hover:bg-white/20 py-1 rounded text-[8px] transition-colors"
                  >
                    TENTAR RECONECTAR AGORA
                  </button>
                </div>
                {lastError && (
                  <div className="text-red-400 mt-2 break-all">
                    Erro: {lastError}
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  if (!room) return <div className="min-h-screen bg-emerald-900 flex items-center justify-center text-white">Conectando...</div>;

  const currentPlayer = isOffline ? room.players[0] : room.players.find(p => p.id === socket.id);
  const isMyTurn = room.players[room.currentTurn]?.id === (isOffline ? 'player-1' : socket.id);
  const myTeam = currentPlayer?.team;

  return (
    <div className="min-h-screen bg-emerald-900 text-white flex flex-col overflow-hidden font-sans select-none">
      {/* Top Bar */}
      <div className="bg-black/40 p-4 flex justify-between items-center border-b border-white/5">
        <div className="flex gap-4">
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Nós</span>
            <span className="text-2xl font-black leading-none">{myTeam === 1 ? room.scores.team1 : room.scores.team2}</span>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Eles</span>
            <span className="text-2xl font-black leading-none">{myTeam === 1 ? room.scores.team2 : room.scores.team1}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white/5 px-3 py-1 rounded-full border border-white/10">
          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-tighter">Valendo {room.roundPoints}</span>
        </div>

        <div className="flex gap-2">
          {!isOffline && (
            <button 
              onClick={handleCopyLink}
              className="p-2 hover:bg-white/10 rounded-full transition-all text-white/50 relative group"
              title="Convidar Amigo"
            >
              {copied ? <Check className="w-5 h-5 text-green-400" /> : <Share2 className="w-5 h-5" />}
              {copied && (
                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/80 text-[10px] px-2 py-1 rounded text-white whitespace-nowrap">
                  Link Copiado!
                </span>
              )}
            </button>
          )}
          <button 
            onClick={() => setChatOpen(!chatOpen)} 
            className={cn(
              "p-2 rounded-full transition-all relative",
              chatOpen ? "bg-yellow-500 text-emerald-950" : "hover:bg-white/10 text-white/50"
            )}
          >
            <MessageSquare className="w-5 h-5" />
            {!chatOpen && room.messages.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[8px] flex items-center justify-center text-white font-bold">
                {room.messages.length}
              </span>
            )}
          </button>
          <button onClick={() => window.location.reload()} className="p-2 hover:bg-white/10 rounded-full transition-all">
            <LogOut className="w-5 h-5 text-white/50" />
          </button>
        </div>
      </div>

      {isOffline && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-1 text-center">
          <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-widest">Modo Offline • Jogando contra CPU</span>
        </div>
      )}

      {/* Game Table */}
      <div className="flex-1 relative flex items-center justify-center p-4">
        {/* Table Felt Pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none flex items-center justify-center overflow-hidden">
           <div className="text-[20vw] font-black uppercase italic tracking-tighter -rotate-12 select-none">TRUCO</div>
        </div>

        {/* Players around the table */}
        <div className="absolute inset-0 p-8">
          {room.players.map((p, idx) => {
            const isCurrent = room.currentTurn === idx;
            // Simple positioning logic
            const positions = [
              "bottom-4 left-1/2 -translate-x-1/2", // Me (handled separately for UI)
              "left-4 top-1/2 -translate-y-1/2",
              "top-4 left-1/2 -translate-x-1/2",
              "right-4 top-1/2 -translate-y-1/2"
            ];
            
            // Reorder players so current user is always at bottom
            const myId = isOffline ? 'player-1' : socket.id;
            const myIdx = room.players.findIndex(player => player.id === myId);
            const relativeIdx = (idx - myIdx + room.players.length) % room.players.length;
            
            if (relativeIdx === 0) return null; // Don't show me here

            return (
              <div key={p.id} className={cn("absolute transition-all duration-500 flex flex-col items-center", positions[relativeIdx])}>
                <div className={cn(
                  "w-12 h-12 rounded-full border-2 flex items-center justify-center bg-emerald-800 shadow-xl relative",
                  isCurrent ? "border-yellow-500 scale-110" : "border-white/20",
                  p.team === myTeam ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-emerald-900" : ""
                )}>
                  <span className="text-lg font-bold">{p.name[0].toUpperCase()}</span>
                  {isCurrent && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 rounded-full animate-ping" />
                  )}
                </div>
                <div className="flex items-center gap-1 mt-1 bg-black/40 px-2 py-0.5 rounded">
                  <div className={cn("w-1.5 h-1.5 rounded-full", p.connected ? "bg-green-500" : "bg-red-500")} />
                  <span className="text-[10px] font-bold uppercase">{p.name}</span>
                </div>
                <div className="flex gap-0.5 mt-1">
                  {p.cards.map((_, cIdx) => (
                    <div key={cIdx} className="w-2 h-3 bg-blue-900 rounded-sm border border-white/20" />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Center Area: Vira and Played Cards */}
        <div className="flex flex-col items-center gap-6 z-10">
          <div className="flex gap-4 items-center">
            {room.vira && (
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-widest mb-1">Vira</span>
                <Card card={room.vira} className="scale-75 origin-top" />
              </div>
            )}
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Manilha</span>
              <div className="w-12 h-16 bg-white/10 rounded-lg border border-white/20 flex items-center justify-center text-xl font-black">
                {room.manilha}
              </div>
            </div>
          </div>

          <div className="flex gap-2 min-h-[100px] items-center justify-center flex-wrap max-w-[300px]">
            <AnimatePresence>
              {room.cardsOnTable.map((pc, idx) => (
                <motion.div
                  key={`${pc.playerId}-${idx}`}
                  initial={{ scale: 0, y: 50, rotate: 0 }}
                  animate={{ scale: 1, y: 0, rotate: (idx % 2 === 0 ? 5 : -5) }}
                  className="flex flex-col items-center"
                >
                  <Card card={pc.card} disabled />
                  <span className="text-[8px] font-bold mt-1 opacity-50">{pc.playerName}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="bg-black/60 backdrop-blur-xl p-6 border-t border-white/10 relative">
        {room.gameState === 'waiting' && (
          <div className="absolute inset-0 bg-emerald-950/90 flex flex-center items-center justify-center z-50 p-6">
            <div className="text-center">
              <Users className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">Aguardando Jogadores</h2>
              <p className="text-sm text-emerald-300 mb-6">{room.players.length} de 4 conectados</p>
              {room.players.length >= 2 && (
                <button
                  onClick={handleStart}
                  className="bg-yellow-500 text-emerald-950 px-8 py-3 rounded-xl font-black uppercase tracking-tighter flex items-center gap-2 mx-auto"
                >
                  <Play className="w-5 h-5 fill-current" /> Começar Jogo
                </button>
              )}
            </div>
          </div>
        )}

        {room.gameState === 'finished' && (
          <div className="absolute inset-0 bg-emerald-950/95 flex flex-center items-center justify-center z-50 p-6">
            <div className="text-center">
              <Trophy className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
              <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-2">
                {room.scores.team1 >= 12 ? (myTeam === 1 ? "VOCÊS VENCERAM!" : "ELES VENCERAM!") : (myTeam === 2 ? "VOCÊS VENCERAM!" : "ELES VENCERAM!")}
              </h2>
              <button
                onClick={handleStart}
                className="mt-6 bg-white text-emerald-950 px-8 py-3 rounded-xl font-black uppercase tracking-tighter"
              >
                Novo Jogo
              </button>
            </div>
          </div>
        )}

        <div className="max-w-2xl mx-auto flex flex-col gap-6">
          {/* Action Buttons */}
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              <button
                disabled={!isMyTurn || room.roundPoints >= 12}
                onClick={handleTruco}
                className="bg-red-600 hover:bg-red-500 disabled:opacity-30 text-white px-6 py-2 rounded-lg font-black uppercase tracking-tighter shadow-lg transition-all active:scale-95"
              >
                Truco!
              </button>
            </div>
            
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-full border-2 flex items-center justify-center bg-emerald-800 relative",
                isMyTurn ? "border-yellow-500 scale-110 shadow-[0_0_15px_rgba(234,179,8,0.5)]" : "border-white/20"
              )}>
                <span className="text-sm font-bold">{playerName[0].toUpperCase()}</span>
                <div className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-emerald-950",
                  isConnected ? "bg-green-500" : "bg-red-500"
                )} />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Sua Vez</span>
                <span className="text-xs font-bold">{isMyTurn ? "Jogue uma carta" : "Aguarde..."}</span>
              </div>
            </div>
          </div>

          {/* My Cards */}
          <div className="flex justify-center gap-4">
            {currentPlayer?.cards.map((card, idx) => (
              <Card
                key={`${card.value}-${card.suit}-${idx}`}
                card={card}
                onClick={() => handlePlayCard(idx)}
                disabled={!isMyTurn}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Truco Call Overlay */}
      <AnimatePresence>
        {trucoCall && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-emerald-900 border-2 border-yellow-500 p-8 rounded-3xl max-w-sm w-full text-center shadow-[0_0_50px_rgba(234,179,8,0.3)]"
            >
              <ShieldAlert className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
              <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white mb-2">
                {trucoCall.callerName} PEDIU TRUCO!
              </h2>
              <p className="text-emerald-200 mb-8">O jogo passará a valer <span className="text-yellow-500 font-bold">{trucoCall.nextPoints} pontos</span>. Qual sua decisão?</p>
              
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleTrucoResponse(false)}
                  className="bg-red-600 hover:bg-red-500 text-white py-4 rounded-xl font-black uppercase tracking-tighter"
                >
                  Correr
                </button>
                <button
                  onClick={() => handleTrucoResponse(true)}
                  className="bg-emerald-500 hover:bg-emerald-400 text-emerald-950 py-4 rounded-xl font-black uppercase tracking-tighter"
                >
                  Aceitar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Sidebar */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-[320px] bg-emerald-950 border-l border-white/10 z-[110] flex flex-col shadow-2xl"
          >
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/20">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-yellow-500" />
                <h3 className="font-black uppercase tracking-tighter italic">Chat da Mesa</h3>
              </div>
              <button onClick={() => setChatOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-all">
                <X className="w-5 h-5 text-white/50" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {room.messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-white/20 text-center p-8">
                  <MessageSquare className="w-12 h-12 mb-2 opacity-10" />
                  <p className="text-xs font-bold uppercase tracking-widest">Nenhuma mensagem ainda</p>
                </div>
              ) : (
                room.messages.map((msg) => {
                  const isMe = msg.senderId === socket.id;
                  return (
                    <div key={msg.id} className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
                      <span className="text-[10px] font-bold text-white/40 mb-1 px-1">
                        {isMe ? "Você" : msg.senderName}
                      </span>
                      <div className={cn(
                        "max-w-[85%] px-3 py-2 rounded-2xl text-sm shadow-sm",
                        isMe 
                          ? "bg-yellow-500 text-emerald-950 rounded-tr-none" 
                          : "bg-white/10 text-white rounded-tl-none border border-white/5"
                      )}>
                        {msg.text}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-4 bg-black/40 border-t border-white/10 flex gap-2">
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Enviar mensagem..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
              <button
                type="submit"
                disabled={!messageText.trim()}
                className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-30 p-2 rounded-xl text-emerald-950 transition-all active:scale-95"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
