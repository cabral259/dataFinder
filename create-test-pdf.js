const fs = require('fs');
const PDFDocument = require('pdfkit');

function createTestPDF() {
    console.log('📄 Creando PDF de prueba...');
    
    // Crear un nuevo documento PDF
    const doc = new PDFDocument();
    const stream = fs.createWriteStream('./ejemplos/test-document.pdf');
    
    doc.pipe(stream);
    
    // Agregar contenido de prueba
    doc.fontSize(20).text('Documento de Prueba', {align: 'center'});
    doc.moveDown();
    doc.fontSize(12).text('Este es un documento PDF de prueba para verificar que el extractor funciona correctamente.');
    doc.moveDown();
    doc.text('Contenido del documento:');
    doc.moveDown();
    doc.text('• Línea 1: Información importante');
    doc.text('• Línea 2: Datos de prueba');
    doc.text('• Línea 3: Contenido extraíble');
    doc.moveDown();
    doc.text('Este texto debería aparecer cuando se extraiga el PDF.');
    
    // Finalizar el documento
    doc.end();
    
    stream.on('finish', () => {
        console.log('✅ PDF de prueba creado: ./ejemplos/test-document.pdf');
        console.log('📝 Contenido esperado:');
        console.log('  - Documento de Prueba');
        console.log('  - Este es un documento PDF de prueba...');
        console.log('  - • Línea 1: Información importante');
        console.log('  - • Línea 2: Datos de prueba');
        console.log('  - • Línea 3: Contenido extraíble');
    });
}

// Ejecutar si se llama directamente
if (require.main === module) {
    createTestPDF();
}

module.exports = { createTestPDF }; 