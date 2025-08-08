const ExtractorDatos = require('./index');
const fs = require('fs');

async function testSpecificFields() {
    console.log('🧪 Probando extracción de campos específicos...\n');
    
    const extractor = new ExtractorDatos();
    
    // Crear un archivo de texto de prueba
    const testContent = `
    Control: A.5.1.1
    Descripción: Política de seguridad de la información
    Estado: Cumple
    Evidencia: Documento de política aprobada
    
    Control: A.6.1.2
    Descripción: Gestión de recursos humanos
    Estado: No cumple
    Evidencia: Falta documentación
    
    Control: A.9.2.3
    Descripción: Control de acceso físico
    Estado: Cumple parcialmente
    Evidencia: Implementado parcialmente
    `;
    
    fs.writeFileSync('./ejemplos/test-specific.txt', testContent);
    
    // Probar extracción de campos específicos
    const options = {
        extractionType: 'specific',
        specificFields: ['Estado', 'Control', 'política']
    };
    
    try {
        const result = await extractor.extractFromFile('./ejemplos/test-specific.txt', options);
        
        console.log('📋 Resultado de extracción específica:');
        console.log('=====================================');
        console.log(`✅ Éxito: ${result.success}`);
        console.log(`📄 Archivo: ${result.fileName}`);
        console.log(`📝 Texto extraído (${result.data.text.length} caracteres):`);
        console.log('----------------------------------------');
        console.log(result.data.text);
        console.log('----------------------------------------');
        
        // Probar con el PDF de prueba
        console.log('\n🧪 Probando con PDF de prueba...');
        const pdfResult = await extractor.extractFromFile('./ejemplos/test-document.pdf', options);
        
        console.log(`✅ Éxito: ${pdfResult.success}`);
        console.log(`📄 Archivo: ${pdfResult.fileName}`);
        console.log(`📝 Texto extraído (${pdfResult.data.text.length} caracteres):`);
        console.log('----------------------------------------');
        console.log(pdfResult.data.text);
        console.log('----------------------------------------');
        
    } catch (error) {
        console.error('❌ Error durante la prueba:', error.message);
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    testSpecificFields().catch(console.error);
}

module.exports = { testSpecificFields }; 