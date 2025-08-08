const ExtractorDatos = require('./index');
const fs = require('fs');

async function testLargeDocument() {
    console.log('🧪 Probando procesamiento de documentos grandes...\n');
    
    const extractor = new ExtractorDatos();
    
    // Crear un documento grande de prueba (simulando 25 páginas)
    let largeContent = '';
    for (let page = 1; page <= 25; page++) {
        largeContent += `=== PÁGINA ${page} ===\n`;
        largeContent += `Documento de prueba - Página ${page}\n`;
        largeContent += `Order Number: ${100000 + page}\n`;
        largeContent += `Email: test${page}@example.com\n`;
        largeContent += `Phone: 555-${String(page).padStart(3, '0')}-1234\n`;
        largeContent += `Price: $${page * 10}.00\n`;
        largeContent += `ID: ID-${String(page).padStart(4, '0')}\n`;
        largeContent += `Fecha: ${page}/1/2024\n`;
        largeContent += `Contenido adicional de la página ${page} con información relevante.\n`;
        largeContent += `Más texto para simular un documento real con múltiples líneas.\n`;
        largeContent += `Información importante que debe ser extraída correctamente.\n\n`;
    }
    
    fs.writeFileSync('./ejemplos/large-document.txt', largeContent);
    
    // Probar extracción de campos específicos
    const options = {
        extractionType: 'specific',
        specificFields: ['order', 'email', 'phone', 'price', 'id', 'fecha']
    };
    
    try {
        console.log('📄 Procesando documento grande...');
        const result = await extractor.extractFromFile('./ejemplos/large-document.txt', options);
        
        console.log('📋 Resultado de extracción:');
        console.log('==========================');
        console.log(`✅ Éxito: ${result.success}`);
        console.log(`📄 Archivo: ${result.fileName}`);
        console.log(`📝 Texto extraído (${result.data.text.length} caracteres):`);
        console.log('----------------------------------------');
        console.log(result.data.text);
        console.log('----------------------------------------');
        
        // Probar con diferentes patrones individuales
        console.log('\n🧪 Probando patrones individuales...');
        
        const patterns = ['order', 'email', 'phone', 'price', 'id', 'fecha'];
        
        for (const pattern of patterns) {
            const patternOptions = {
                extractionType: 'specific',
                specificFields: [pattern]
            };
            
            const patternResult = await extractor.extractFromFile('./ejemplos/large-document.txt', patternOptions);
            console.log(`\n📊 Patrón "${pattern}":`);
            console.log(patternResult.data.text.substring(0, 200) + '...');
        }
        
    } catch (error) {
        console.error('❌ Error durante la prueba:', error.message);
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    testLargeDocument().catch(console.error);
}

module.exports = { testLargeDocument }; 