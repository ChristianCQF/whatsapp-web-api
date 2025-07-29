// routes/whatsapp.js
const express = require('express');
const router = express.Router();
const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

// Inicializar el cliente de WhatsApp
const client = new Client({
    puppeteer: {
        headless: true,
    },
});

let receivedMessages = []; // Arreglo para almacenar los mensajes recibidos
let latestQR = null; // Variable para almacenar el último QR generado
let isReady = false; // Variable para controlar el estado de conexión

client.on('qr', async qr => {
    latestQR = await qrcode.toDataURL(qr); // Genera el QR como imagen base64
    isReady = false;
});

client.on('ready', () => {
    isReady = true;
    console.log('Client is ready!');
});

client.on('message_create', message => {
    // Guardar los mensajes entrantes
    receivedMessages.push({
        id: message.id._serialized,
        from: message.from,
        body: message.body,
        timestamp: message.timestamp,
    });
});

client.initialize();

// Ruta para mostrar el QR y el mini mensajero
router.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, 'qr.html');
    const mensajeroPath = path.join(__dirname, 'mensajero.html');
    fs.readFile(htmlPath, 'utf8', (err, html) => {
        if (err) {
            return res.status(500).send('Error cargando la página');
        }
        let qrSection = '';
        if (!isReady) {
            if (!latestQR) {
                qrSection = '<h2>QR no disponible. Espere un momento...</h2>';
                html = html.replace('{{QR_SECTION}}', qrSection);
                return res.send(html);
            } else {
                qrSection = `
                    <div class="qr">
                        <p>Escanea este código QR con WhatsApp</p>
                        <img src="${latestQR}" />
                    </div>
                `;
                html = html.replace('{{QR_SECTION}}', qrSection);
                return res.send(html);
            }
        } else {
            // Leer el mensajero y ponerlo en el HTML principal
            fs.readFile(mensajeroPath, 'utf8', (err2, mensajeroHtml) => {
                if (err2) {
                    return res.status(500).send('Error cargando el mensajero');
                }
                html = html.replace('{{QR_SECTION}}', mensajeroHtml);
                res.send(html);
            });
        }
    });
});

// Endpoint para enviar un mensaje
router.post('/send', async (req, res) => {
    const { numeroDestino, mensaje } = req.body;

    if (!numeroDestino || !mensaje) {
        return res.status(400).json({ error: 'Número de destino y mensaje son requeridos' });
    }

    try {
        const chatId = `${numeroDestino}@c.us`;
        const response = await client.sendMessage(chatId, mensaje);
        res.json({ message: 'Mensaje enviado', response });
    } catch (error) {
        console.error('Error al enviar mensaje:', error);
        res.status(500).json({ error: 'Error al enviar mensaje' });
    }
});

// Endpoint para obtener los mensajes recibidos
router.get('/messages', (req, res) => {
    res.json({ messages: receivedMessages });
});

module.exports = router;
