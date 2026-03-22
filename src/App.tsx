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
import { Trophy, Users, Play, LogOut, MessageSquare, ShieldAlert } from 'lucide-react';

const socket: Socket = io(window.location.origin, {
  transports: ['websocket'],
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
});

export default function App() {
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('sala-truco');
  const [joined, setJoined] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [trucoCall, setTrucoCall] = useState<{ callerName: string; nextPoints: number } | null>(null);
  const [isConnected, setIsConnected] = useState(socket.connected);

  useEffect(() => {
    // Check server health
    fetch('/api/ping')
      .then(r => r.json())
      .then(data => console.log('Servidor respondendo:', data))
      .catch(err => console.error('Servidor inacessível:', err));

    function onConnect() {
      setIsConnected(true);
      console.log('Conectado ao servidor de Truco');
    }

    function onDisconnect() {
      setIsConnected(false);
      console.log('Desconectado do servidor');
    }

    function onConnectError(err: any) {
      console.error('Erro de conexão:', err);
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
      socket.emit('join_room', { roomId, playerName });
      setJoined(true);
    }
  };

  const handleStart = () => {
    socket.emit('start_game', roomId);
  };

  const handlePlayCard = (index: number) => {
    socket.emit('play_card', { roomId, cardIndex: index });
  };

  const handleTruco = () => {
    socket.emit('truco_request', { roomId });
  };

  const handleTrucoResponse = (accepted: boolean) => {
    socket.emit('truco_response', { roomId, accepted });
    setTrucoCall(null);
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
              {isConnected ? "Pronto para jogar!" : "Tentando conectar ao servidor..."}
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
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-all"
              />
            </div>
            <button
              onClick={handleJoin}
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-emerald-950 font-black py-4 rounded-xl transition-all shadow-lg active:scale-95 uppercase tracking-tighter text-lg"
            >
              Entrar na Mesa
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!room) return <div className="min-h-screen bg-emerald-900 flex items-center justify-center text-white">Conectando...</div>;

  const currentPlayer = room.players.find(p => p.id === socket.id);
  const isMyTurn = room.players[room.currentTurn]?.id === socket.id;
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

        <button onClick={() => window.location.reload()} className="p-2 hover:bg-white/10 rounded-full transition-all">
          <LogOut className="w-5 h-5 text-white/50" />
        </button>
      </div>

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
            const myIdx = room.players.findIndex(player => player.id === socket.id);
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
                <span className="text-[10px] font-bold mt-1 bg-black/40 px-2 py-0.5 rounded uppercase">{p.name}</span>
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
                "w-10 h-10 rounded-full border-2 flex items-center justify-center bg-emerald-800",
                isMyTurn ? "border-yellow-500 scale-110 shadow-[0_0_15px_rgba(234,179,8,0.5)]" : "border-white/20"
              )}>
                <span className="text-sm font-bold">{playerName[0].toUpperCase()}</span>
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
    </div>
  );
}
