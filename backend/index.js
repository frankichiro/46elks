
import { DurableObject } from 'cloudflare:workers';

// HELPERS ////////////////////////////////////////////////////////////////////

class ResponseError extends Error {
	constructor(code = 500, ...params) {
		super(...params);
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this,ResponseError);
		}
		this.name = 'ResponseError';
		this.code = code;
	}
}
class ResponseSuccess extends Response {
	constructor(body, status = 200, statusText = 'OK', headers = {}, settings = {}) {
		body = typeof body === 'object' && body !== null ? JSON.stringify(body) : body;
		super(body, {status, statusText, headers, ...settings});
	}
}

// DURABLE OBJECT /////////////////////////////////////////////////////////////

export class MyDurableObject extends DurableObject {
	constructor(ctx, env) {
		super(ctx, env);
		this.ctx = ctx;
		this.env = env;
		const create = async () => {
			const query = 'CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, sender TEXT, recipient TEXT, message TEXT, created TEXT,show INTEGER DEFAULT 1)';
			this.ctx.storage.sql.exec(query);
		};
		this.ctx.blockConcurrencyWhile(create);
	}
	async fetch(request) {
        const url = new URL(request.url);
		if (request.headers.get('Upgrade') === 'websocket') {
            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);
			this.ctx.acceptWebSocket(server);
			const options = {webSocket: client};
			return new ResponseSuccess(null,101,'Switching Protocols',{},options);
        }
		return new ResponseSuccess(null,404,'Not found');
    }
	async addMessage(request) {
		try {
			const formData = await request.formData();
			const input = {};
			const extract = key => input[key] = formData.get(key);
			Object.keys(formData).forEach(extract);
			const {
				id,				// The unique id of the message in our systems.
				from: sender,	// The sender of the SMS.
				to: recipient,	// The phone number the SMS was sent to.
				message,		// The contents of the SMS.
				direction,		// The direction of the SMS. Always ”incoming” for incoming SMS.
				created			// The time in UTC when the SMS object was created in our systems.
			} = input;
			let query,statement;
			if (message.match(/DELETE [a-z1-9]{33}/)) {
				const existingID = message.split(' ')[1];
				query = 'UPDATE messages SET show = 0 WHERE id = ?';
				statement = await this.ctx.storage.sql.exec(query,existingID);
				await statement.run();
				this.broadcast('remove',{});
				return new ResponseSuccess('Message removed!');
			} else {
				query = 'INSERT INTO messages (id,sender,recipient,message,created,show) VALUES (?,?,?,?,?,1)';
				statement = await this.ctx.storage.sql.exec(query,id,sender,recipient,message,created);
				await statement.run();
				const object = {id,sender,recipient,message,created};
				this.broadcast('add',object);
				return new ResponseSuccess('Message added. To remove, send: DELETE '+id);
			}
		} catch (error) {
			throw new ResponseError(404,'Bad data: '+url.pathname);
		}
	}
	broadcast(action,data) {
		const message = {action,data};
		const json = JSON.stringify(message);
		const webSockets = this.ctx.getWebSockets();
        for (const ws of webSockets) {
            try {
                ws.send(json);
            } catch (error) {
				console.error(error);
            }
        }
    }
	async webSocketMessage(ws, message) {
		try {
			const data = JSON.parse(message);
			let query,statement,cursorList,result = [];
			switch (data.action) {
				case 'load':
					query = 'SELECT id,sender,message,created FROM messages WHERE show = 1 ORDER BY created ASC LIMIT ?';
					cursorList = this.ctx.storage.sql.exec(query, data.limit || 3);
					result = [...cursorList];
					break;
				case 'list':
					if (data.secret !== this.env.secret) {
						throw new Error('unauthorized');
					}
					query = 'SELECT * FROM messages ORDER BY created ASC';
					cursorList = await this.ctx.storage.sql.exec(query);
					result = [...cursorList];
					break;
				case 'hide':
					if (data.secret !== this.env.secret) {
						throw new Error('unauthorized');
					}
					query = 'UPDATE messages SET show = 0';
					statement = await this.ctx.storage.sql.exec(query);
					result = { success: true };
					break;
				case 'clear':
					if (data.secret !== this.env.secret) {
						throw new Error('unauthorized');
					}
					query = 'DELETE FROM messages';
					statement = await this.ctx.storage.sql.exec(query);
					result = { success: true };
					break;
			}
			this.broadcast(data.action+'ed',result);
		} catch (error) {
			if (error.message == 'unauthorized') {
				this.broadcast('unauthorized',{});
			} else {
				console.error(error);
			}
		}
    }
    async webSocketClose(ws, code, reason, wasClean) {
        // Cleanup if necessary
	}
}

// FETCH //////////////////////////////////////////////////////////////////////

export default {
	async fetch(request, env, ctx) {
		try {
			const url = new URL(request.url);
			const binding = env.DO46ELKS;
			const id = binding.idFromName('46elks');
			const stub = binding.get(id);
			switch (request.method+' '+url.pathname) {
				case 'GET /api/websocket':
					if (request.headers.get('Upgrade') !== 'websocket') {
						throw new ResponseError(426,'Upgrade Required (expected WebSocket)');
					}
					return await stub.fetch(request);
				case 'POST /api/incoming-sms':
					return await stub.addMessage(request);
				default:
					throw new ResponseError(404,'File not found: '+url.pathname);
			}
		} catch (error) {
			console.error(error);
			const custom = error.name == 'ResponseError';
			const message = custom ? error.message : 'Server error';
			const options = custom ? { status: error.code } : { status: 500 };
			return new Response(message,options);
		}
	}
};
