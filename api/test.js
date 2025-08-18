// Archivo de prueba para verificar que el endpoint funciona
module.exports = async (req, res) => {
    console.log('🧪 Test endpoint iniciado');
    
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Respuesta de prueba
    res.status(200).json({
        success: true,
        message: 'Test endpoint funcionando correctamente',
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url
    });
};
