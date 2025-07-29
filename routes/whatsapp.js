// routes/whatsapp.js
const express = require('express');
const router = express.Router();
const { Client, MessageMedia } = require('whatsapp-web.js');
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
                //qrSection = '<h2>QR no disponible. Espere un momento...</h2>';
                qrSection = `
                            <div style="text-align:center;">
                                <h2>QR no disponible. Espere un momento...</h2>
                                <script>
                                    setTimeout(() => {
                                        location.reload();
                                    }, 3000); // vuelve a intentar cada 3 segundos
                                </script>
                            </div>
                        `;

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
    const { number, message } = req.body;

    if (!number || !message) {
        return res.status(400).json({ error: 'Número de destino y mensaje son requeridos' });
    }

    try {
        const chatId = `${number}@c.us`;
        const response = await client.sendMessage(chatId, message);
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

// Endpoint para verificar el estado del cliente
router.get('/status', (req, res) => {
    res.json({ ready: isReady });
});

// Endpoint para reiniciar el cliente de WhatsApp
router.get('/reset', async (req, res) => {
    try {
        console.log('🔁 Reiniciando cliente de WhatsApp...');
        await client.destroy();       // Cierra sesión actual
        receivedMessages = [];        // Limpia mensajes recibidos
        isReady = false;
        latestQR = null;

        client.initialize();          // Re-inicializa el cliente

        res.json({
            success: true,
            message: 'Cliente de WhatsApp reiniciado. Se generará un nuevo código QR.',
            timestamp: Date.now()
        });
    } catch (err) {
        console.error('❌ Error al resetear:', err);
        res.status(500).json({
            success: false,
            error: 'No se pudo reiniciar el cliente de WhatsApp',
            details: err.message
        });
    }
});

router.post('/sendMedia', async (req, res) => {
    const { number, message, imageUrl } = req.body;

    if (!number) {
        return res.status(400).json({ error: 'Número de destino es requerido' });
    }

    const chatId = `${number}@c.us`;

    try {
        // Si hay imagen, descargar y enviar
        if (imageUrl) {
            const media = await MessageMedia.fromUrl(imageUrl);
            const sentMessage = await client.sendMessage(chatId, media, {
                caption: message || '', // mensaje opcional
            });
            return res.json({ message: 'Imagen enviada con éxito', sentMessage });
        } else if (message) {
            // Solo mensaje de texto
            const sentMessage = await client.sendMessage(chatId, message);
            return res.json({ message: 'Mensaje enviado con éxito', sentMessage });
        } else {
            return res.status(400).json({ error: 'Debe enviar un mensaje o una imagen' });
        }
    } catch (err) {
        console.error('Error al enviar media:', err);
        return res.status(500).json({ error: 'Error al enviar imagen o mensaje' });
    }
});


router.get('/contacts', async (req, res) => {
    try {
        const contacts = await client.getContacts();
        const filtered = contacts.map(c => ({
            number: c.number,
            name: c.name || c.pushname || 'Sin nombre',
            id: c.id._serialized,
            isBusiness: c.isBusiness,
            isMyContact: c.isMyContact
        }));
        res.json({ contacts: filtered });
    } catch (err) {
        console.error('Error al obtener contactos:', err);
        res.status(500).json({ error: 'Error al obtener contactos' });
    }
});

module.exports = router;
