import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DrawGuessService } from './draw-guess.service';
import { DrawGuessStrokePayload } from './draw-guess.types';

@WebSocketGateway({
  cors: {
    origin: true,
  },
})
export class DrawGuessGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly roomTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly drawGuessService: DrawGuessService) {}

  handleConnection(socket: Socket) {
    socket.emit('drawGuess:ready', { message: 'draw guess gateway connected' });
    socket.emit('drawGuess:roomList', this.drawGuessService.listRooms());
  }

  async handleDisconnect(socket: Socket) {
    const result = await this.drawGuessService.leaveRoom(socket.id);
    if (!result) {
      return;
    }

    this.stopRoomTimer(result.roomCode);
    socket.leave(result.roomCode);

    if (!result.deleted && result.state) {
      this.server.to(result.roomCode).emit('drawGuess:roomUpdate', result.state);
      if (this.shouldRunRoomTimer(result.state)) {
        this.startRoomTimer(result.roomCode);
      }
    }

    this.broadcastRoomList();
  }

  @SubscribeMessage('drawGuess:roomListRequest')
  handleRoomListRequest(@ConnectedSocket() socket: Socket) {
    const list = this.drawGuessService.listRooms();
    socket.emit('drawGuess:roomList', list);
    return list;
  }

  @SubscribeMessage('drawGuess:roomCreate')
  async handleRoomCreate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { playerName?: string; maxPlayers?: number; roundsPerPlayer?: number },
  ) {
    try {
      await this.leaveCurrentRoom(socket);
      const result = this.drawGuessService.createRoom(
        socket.id,
        body?.playerName ?? '',
        body?.maxPlayers ?? 6,
        body?.roundsPerPlayer ?? 2,
      );
      socket.join(result.roomCode);
      socket.emit('drawGuess:joined', result);
      this.server.to(result.roomCode).emit('drawGuess:roomUpdate', result.state);
      this.broadcastRoomList();
    } catch (error) {
      this.emitError(socket, error);
    }
  }

  @SubscribeMessage('drawGuess:roomJoin')
  async handleRoomJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { roomCode?: string; playerName?: string },
  ) {
    try {
      await this.leaveCurrentRoom(socket);
      const result = this.drawGuessService.joinRoom(socket.id, body?.roomCode ?? '', body?.playerName ?? '');
      socket.join(result.roomCode);
      socket.emit('drawGuess:joined', result);
      this.server.to(result.roomCode).emit('drawGuess:roomUpdate', result.state);
      this.broadcastRoomList();
    } catch (error) {
      this.emitError(socket, error);
    }
  }

  @SubscribeMessage('drawGuess:roomLeave')
  async handleRoomLeave(@ConnectedSocket() socket: Socket) {
    const result = await this.drawGuessService.leaveRoom(socket.id);
    if (!result) {
      return;
    }

    this.stopRoomTimer(result.roomCode);
    socket.leave(result.roomCode);

    if (!result.deleted && result.state) {
      this.server.to(result.roomCode).emit('drawGuess:roomUpdate', result.state);
      if (this.shouldRunRoomTimer(result.state)) {
        this.startRoomTimer(result.roomCode);
      }
    }

    this.broadcastRoomList();
  }

  @SubscribeMessage('drawGuess:playerReadyToggle')
  handlePlayerReadyToggle(@ConnectedSocket() socket: Socket) {
    try {
      const result = this.drawGuessService.toggleReady(socket.id);
      this.server.to(result.roomCode).emit('drawGuess:roomUpdate', result.state);
    } catch (error) {
      this.emitError(socket, error);
    }
  }

  @SubscribeMessage('drawGuess:roundStart')
  async handleRoundStart(@ConnectedSocket() socket: Socket) {
    try {
      const result = await this.drawGuessService.startRound(socket.id);
      this.stopRoomTimer(result.roomCode);
      this.server.to(result.roomCode).emit('drawGuess:canvasClear');
      this.server.to(result.roomCode).emit('drawGuess:roomUpdate', result.state);
      if (result.drawerSocketId && result.secretWord) {
        this.server.to(result.drawerSocketId).emit('drawGuess:secretWord', result.secretWord);
      }
      if (this.shouldRunRoomTimer(result.state)) {
        this.startRoomTimer(result.roomCode);
      }
      this.broadcastRoomList();
    } catch (error) {
      this.emitError(socket, error);
    }
  }

  @SubscribeMessage('drawGuess:roundBegin')
  handleRoundBegin(@ConnectedSocket() socket: Socket) {
    try {
      const result = this.drawGuessService.beginRound(socket.id);
      this.server.to(result.roomCode).emit('drawGuess:roomUpdate', result.state);
      this.startRoomTimer(result.roomCode);
    } catch (error) {
      this.emitError(socket, error);
    }
  }

  @SubscribeMessage('drawGuess:guessSubmit')
  async handleGuessSubmit(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { guess?: string },
  ) {
    try {
      const result = await this.drawGuessService.submitGuess(socket.id, body?.guess ?? '');
      if ('shouldClearCanvas' in result && result.shouldClearCanvas) {
        this.server.to(result.roomCode).emit('drawGuess:canvasClear');
      }
      this.server.to(result.roomCode).emit('drawGuess:roomUpdate', result.state);
      if ('drawerSocketId' in result && 'secretWord' in result && result.drawerSocketId && result.secretWord) {
        this.server.to(result.drawerSocketId).emit('drawGuess:secretWord', result.secretWord);
      }
      if (!this.shouldRunRoomTimer(result.state)) {
        this.stopRoomTimer(result.roomCode);
      }
    } catch (error) {
      this.emitError(socket, error);
    }
  }

  @SubscribeMessage('drawGuess:canvasStroke')
  handleCanvasStroke(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: DrawGuessStrokePayload,
  ) {
    try {
      const result = this.drawGuessService.pushStroke(socket.id, body);
      socket.to(result.roomCode).emit('drawGuess:canvasStroke', result.stroke);
    } catch (error) {
      this.emitError(socket, error);
    }
  }

  @SubscribeMessage('drawGuess:canvasClear')
  handleCanvasClear(@ConnectedSocket() socket: Socket) {
    try {
      const result = this.drawGuessService.clearCanvas(socket.id);
      this.server.to(result.roomCode).emit('drawGuess:canvasClear');
    } catch (error) {
      this.emitError(socket, error);
    }
  }

  @SubscribeMessage('drawGuess:canvasUndo')
  handleCanvasUndo(@ConnectedSocket() socket: Socket) {
    try {
      const result = this.drawGuessService.undoCanvas(socket.id);
      this.server.to(result.roomCode).emit('drawGuess:canvasSync', {
        canvasEvents: result.canvasEvents,
      });
      this.server.to(result.roomCode).emit('drawGuess:roomUpdate', result.state);
    } catch (error) {
      this.emitError(socket, error);
    }
  }

  @SubscribeMessage('drawGuess:matchReset')
  handleMatchReset(@ConnectedSocket() socket: Socket) {
    try {
      const result = this.drawGuessService.resetMatch(socket.id);
      this.stopRoomTimer(result.roomCode);
      this.server.to(result.roomCode).emit('drawGuess:canvasClear');
      this.server.to(result.roomCode).emit('drawGuess:roomUpdate', result.state);
    } catch (error) {
      this.emitError(socket, error);
    }
  }

  private startRoomTimer(roomCode: string) {
    this.stopRoomTimer(roomCode);
    const timer = setInterval(async () => {
      const result = await this.drawGuessService.handleTick(roomCode);
      if (!result) {
        this.stopRoomTimer(roomCode);
        return;
      }

      if ('shouldClearCanvas' in result && result.shouldClearCanvas) {
        this.server.to(result.roomCode).emit('drawGuess:canvasClear');
      }
      this.server.to(result.roomCode).emit('drawGuess:roomUpdate', result.state);
      if ('drawerSocketId' in result && 'secretWord' in result && result.drawerSocketId && result.secretWord) {
        this.server.to(result.drawerSocketId).emit('drawGuess:secretWord', result.secretWord);
      }
      if (!this.shouldRunRoomTimer(result.state)) {
        this.stopRoomTimer(roomCode);
      }
    }, 1000);

    this.roomTimers.set(roomCode, timer);
  }

  private stopRoomTimer(roomCode: string) {
    const timer = this.roomTimers.get(roomCode);
    if (timer) {
      clearInterval(timer);
      this.roomTimers.delete(roomCode);
    }
  }

  private emitError(socket: Socket, error: unknown) {
    socket.emit('drawGuess:error', {
      message: error instanceof Error ? error.message : '操作失败，请稍后重试。',
    });
  }

  private async leaveCurrentRoom(socket: Socket) {
    const result = await this.drawGuessService.leaveRoom(socket.id);
    if (!result) {
      return;
    }

    this.stopRoomTimer(result.roomCode);
    socket.rooms.forEach((room) => {
      if (room !== socket.id) {
        socket.leave(room);
      }
    });

    if (!result.deleted && result.state) {
      this.server.to(result.roomCode).emit('drawGuess:roomUpdate', result.state);
      if (this.shouldRunRoomTimer(result.state)) {
        this.startRoomTimer(result.roomCode);
      }
    }

    this.broadcastRoomList();
  }

  private broadcastRoomList() {
    this.server.emit('drawGuess:roomList', this.drawGuessService.listRooms());
  }

  private shouldRunRoomTimer(state: { phase: string }) {
    return state.phase === 'drawing';
  }
}
