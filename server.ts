/**
 * Custom Next.js Server with WebSocket Support
 * 
 * This server extends Next.js with WebSocket functionality for real-time updates.
 * Run with: npm run dev:ws or node server.ts
 */

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { verify } from 'jsonwebtoken';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

interface JWTPayload {
  userId: string;
  tenantId?: string;
  role?: string;
  email?: string;
}

interface SocketData {
  userId: string;
  tenantId?: string;
  role?: string;
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // Initialize Socket.IO
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/api/socket',
    transports: ['websocket', 'polling'],
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        return next(new Error('JWT_SECRET not configured'));
      }

      const decoded = verify(token, secret) as JWTPayload;
      
      // Attach user data to socket
      socket.data = {
        userId: decoded.userId,
        tenantId: decoded.tenantId,
        role: decoded.role,
      } as SocketData;

      console.log(`[WebSocket] ✅ Client authenticated: ${decoded.email || decoded.userId}`);
      next();
    } catch (error) {
      console.error('[WebSocket] ❌ Authentication failed:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Connection handling
  io.on('connection', (socket) => {
    const userData = socket.data as SocketData;
    const userId = userData.userId;
    const tenantId = userData.tenantId;

    console.log(`[WebSocket] 🔌 Client connected: ${socket.id} (User: ${userId})`);

    // Join tenant room for multi-tenancy
    if (tenantId) {
      socket.join(`tenant:${tenantId}`);
      console.log(`[WebSocket] 🏢 Joined tenant room: tenant:${tenantId}`);
    }

    // Join user-specific room
    socket.join(`user:${userId}`);

    // Subscribe to specific data streams
    socket.on('subscribe:queue', (filters?: { status?: string[]; doctorId?: string; roomId?: string }) => {
      const room = `queue:${tenantId || 'default'}`;
      socket.join(room);
      console.log(`[WebSocket] 📋 Subscribed to queue updates (Room: ${room})`);
    });

    socket.on('subscribe:appointments', (filters?: { date?: string; doctorId?: string; status?: string }) => {
      const room = `appointments:${tenantId || 'default'}`;
      socket.join(room);
      console.log(`[WebSocket] 📅 Subscribed to appointment updates (Room: ${room})`);
    });

    socket.on('subscribe:visits', (filters?: { patientId?: string; doctorId?: string; status?: string }) => {
      const room = `visits:${tenantId || 'default'}`;
      socket.join(room);
      console.log(`[WebSocket] 🩺 Subscribed to visit updates (Room: ${room})`);
    });

    socket.on('subscribe:prescriptions', () => {
      const room = `prescriptions:${tenantId || 'default'}`;
      socket.join(room);
      console.log(`[WebSocket] 💊 Subscribed to prescription updates (Room: ${room})`);
    });

    socket.on('subscribe:invoices', () => {
      const room = `invoices:${tenantId || 'default'}`;
      socket.join(room);
      console.log(`[WebSocket] 💰 Subscribed to invoice updates (Room: ${room})`);
    });

    // Unsubscribe events
    socket.on('unsubscribe:queue', () => {
      socket.leave(`queue:${tenantId || 'default'}`);
      console.log(`[WebSocket] ❌ Unsubscribed from queue updates`);
    });

    socket.on('unsubscribe:appointments', () => {
      socket.leave(`appointments:${tenantId || 'default'}`);
      console.log(`[WebSocket] ❌ Unsubscribed from appointment updates`);
    });

    socket.on('unsubscribe:visits', () => {
      socket.leave(`visits:${tenantId || 'default'}`);
      console.log(`[WebSocket] ❌ Unsubscribed from visit updates`);
    });

    // Heartbeat/ping for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Disconnection handling
    socket.on('disconnect', (reason) => {
      console.log(`[WebSocket] 🔌 Client disconnected: ${socket.id} (Reason: ${reason})`);
    });

    // Error handling
    socket.on('error', (error) => {
      console.error(`[WebSocket] ❌ Socket error:`, error);
    });
  });

  // Make io instance globally available for API routes
  (global as any).io = io;

  // Start server
  server.listen(port, () => {
    console.log(`\n🚀 Server is running on http://${hostname}:${port}`);
    console.log(`📡 WebSocket endpoint: ws://${hostname}:${port}/api/socket`);
    console.log(`🔧 Environment: ${dev ? 'development' : 'production'}\n`);
  });
});
