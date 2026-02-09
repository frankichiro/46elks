
const Index = new class {
	#webSocket;
	#elements = {};
	#letters;
	#stripPositions;
	#stripOffsets = [-2,0,0,0,0,-1];
	#lineArrays;
	#spriteCanvas;
	#play = true;
	#scrollOffset = 0;
	#frameCount = 0;
	#ledsPerStrip = 144;
	#ledLines = 6;
	#animationFrameId = null;
	#eyeState = {
		x: 1520,
		y: 375,
		counter: 0
	};
	constructor() {
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		this.#webSocket = new WebSocket(protocol+'//'+window.location.host+'/api/websocket');
		this.#webSocket.addEventListener('open',this,false);
		this.#webSocket.addEventListener('message',this,false);
		this.#webSocket.addEventListener('close',this,false);
		this.#webSocket.addEventListener('error',this,false);
		document.body.querySelectorAll('*[id]').forEach(element => this.#elements[element.id] = element);
		this.#elements.about.addEventListener('click',this,false);
		this.#elements.close.addEventListener('click',this,false);
		this.#elements.admin.addEventListener('click',this,false);
		this.setup();
	}
	handleEvent(event) {
		switch (event.type) {
			case 'open':
				console.log('Connected to Realtime SMS Stream');
				break;
			case 'message':
				this.receiveFromSocket(event.data);
				break;
			case 'error':
				console.error('WebSocket error:',event);
				break;
			case 'close':
				console.log('Connection lost');
				//optional auto-reconnect logic could go here
				break;
			case 'click':
				switch (event.target) {
					case this.#elements.about:
						this.#elements.dialog.showModal();
						break;
					case this.#elements.close:
						this.#elements.dialog.close();
						break;
					case this.#elements.admin:
						event.preventDefault();
						console.log(event.target.form);
						break;
				}
		}
	}
	async setup() {
		const response = await fetch('letters.json');
		this.#letters = await response.json();
		this.loadMessages();
	}
	loadMessages() {
		const message = {
			action: 'load',
			limit: 3
		};
		this.sendToSocket(message);
	}
	sendToSocket(data) {
		if (this.#webSocket && this.#webSocket.readyState === WebSocket.OPEN) {
			const payload = JSON.stringify(data);
			this.#webSocket.send(payload);
		} else {
			console.log('Not connected!');
		}
	}
	receiveFromSocket(object) {
		object = JSON.parse(object);
		switch (object.action) {
			case 'added':
				console.log('New message!');
			case 'loaded':
				let text = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ!?,.-_@#/:+0123456789 ';
				if (object.data.length > 0) {
					console.log(object);
				}

				/*const text = '      '+[
					'Det här är på Svenska för test.',
					'The quick brown fox jumps over the lazy dog.'
				].join('      ');*/
				this.#lineArrays = this.textToLines(text);
				this.drawLetters();
				this.animate();
				break;
			case 'listed':
			case 'hided':
			case 'cleared':
			case 'unauthorized':
				console.log(object);
		}
	}
	// CANVAS /////////////////////////////////////////////////////////////////
	drawEye(context) {
		this.#eyeState.counter += 1;
		context.fillStyle = '#fafbff';
		switch (this.#eyeState.counter) {
			case 10:
				context.beginPath();
				context.arc(this.#eyeState.x, this.#eyeState.y-20, 30, 0, Math.PI * 2);
				context.fill();
				break;
			case 15:
				context.beginPath();
				context.arc(this.#eyeState.x, this.#eyeState.y, 30, 0, Math.PI * 2);
				context.fill();
				break;
			case 20:
				context.clearRect(this.#eyeState.x-30, this.#eyeState.y-60, 60, 120);
				break;
			case 300:
				this.#eyeState.counter = 0;
		}
	}
	drawLetters() {

		const x = 10;
		const spriteSize = x*4;

		this.#spriteCanvas = document.createElement('canvas');
		this.#spriteCanvas.width = spriteSize;
		this.#spriteCanvas.height = spriteSize;
		const sCtx = this.#spriteCanvas.getContext('2d');

		const center = spriteSize / 2;
		sCtx.shadowColor = '#ffffff'; // Cyan Glow
		sCtx.shadowBlur = 8;
		sCtx.fillStyle = '#ffffff';   // White-ish core
		sCtx.beginPath();
		sCtx.arc(center, center, x/2, 0, Math.PI*2);
		sCtx.fill();

		const lines = [
			'M1321.59,517.892C1281.75,581.31 1199.3,569.319 1089.91,526.093C878.132,442.401 565.422,241.623 265.735,244.358C174.903,245.187 43.053,213.848 0,151.859',
			'M1321.59,517.892C1280.88,582.7 1195.66,584.757 1082.68,539.204C871.253,453.961 562.621,258.03 266.588,260.351C175.464,261.065 89.598,252.722 0,223.859',
			'M1321.59,517.892C1280.08,583.983 1192.27,600.174 1075.93,552.462C864.724,465.838 559.489,274.055 266.588,276.351C175.464,277.065 119.905,273.992 0,287.859',
			'M1321.59,517.892C1279.43,585.008 1189.53,615.664 1070.5,566.22C859.512,478.577 556.988,290.074 266.588,292.351C175.464,293.065 98.993,309.269 0,343.859',
			'M1321.59,517.892C1278.71,586.16 1186.43,631.043 1064.35,579.645C853.728,490.975 554.389,306.228 266.896,308.349C175.667,309.021 85.63,352.511 0,399.859',
			'M1321.59,517.892C1278.25,586.886 1184.47,646.627 1060.45,593.996C849.94,504.663 552.331,322.065 266.482,324.352C175.394,325.081 49.015,383.794 0,487.859'
		];

		this.#stripPositions = [];
		for (const line of lines) {
			const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			pathEl.setAttribute('d', line);

			const totalLen = pathEl.getTotalLength();
			const step = totalLen / (this.#ledsPerStrip - 1);
			const points = [];

			for (let i = this.#ledsPerStrip; i > 0; i--) {
				const pt = pathEl.getPointAtLength(i * step);
				const positions = {
					x: Math.floor(pt.x - center),
					y: Math.floor(pt.y - center)
				}
				points.push(positions);
	        }
			this.#stripPositions.push(points);
		}

	}

	animate() {

		const canvas = this.#elements.canvas;
		const context = canvas.getContext('2d');
		const SCROLL_SPEED_DIVIDER = 2;

		if (this.#animationFrameId) {
            cancelAnimationFrame(this.#animationFrameId);
        }

		const draw = () => {
			context.clearRect(0, 0, canvas.width-500, canvas.height);

			if (this.#play) {
                this.#frameCount++;
                if (this.#frameCount % SCROLL_SPEED_DIVIDER === 0) {
                    this.#scrollOffset++;
                }
            }

			this.drawEye(context);

			for (let s = 0; s < this.#ledLines; s++) {

				const dataRow = this.#lineArrays[s];
				const msgLength = dataRow.length;
				const positions = this.#stripPositions[s]; // From previous solution
				const manualOffset = this.#stripOffsets[s];

				for (let i = 0; i < this.#ledsPerStrip; i++) {
					let rawIndex = (i + this.#scrollOffset + manualOffset) % msgLength;
					const dataIndex = (rawIndex + msgLength) % msgLength;
					if (dataRow[dataIndex] === 1) {
						const pos = positions[i];
						context.drawImage(this.#spriteCanvas, pos.x, pos.y);
					}
				}
			}
			if (this.#play) {
                this.#animationFrameId = requestAnimationFrame(draw);
			}
		}

		draw();
	}
	textToLines(text) {
		const letters = text.toUpperCase().split('');
		const lines = [[],[],[],[],[],[]];
		for (let letter of letters) {
			const charGrid = this.#letters[letter] || this.#letters.missing;
			for (let i = 0; i < lines.length; i++) {
				lines[i].push(...charGrid[i],0,0);
			}
		}
		return lines.map(array => new Uint8Array(array));
	}
}
