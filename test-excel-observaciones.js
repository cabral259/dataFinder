const ExtractorDatos = require('./index');
const XLSX = require('xlsx');
const fs = require('fs');

async function testExcelObservaciones() {
    console.log('🧪 Probando extracción de Excel con observaciones...\n');
    
    const extractor = new ExtractorDatos();
    
    // Crear un archivo Excel de prueba con observaciones
    const workbook = XLSX.utils.book_new();
    
    const data = [
        ['Control', 'Descripción', 'Estado', 'Observaciones'],
        ['A.5.1.1', 'Política de seguridad', 'Cumple', 'Documento aprobado y comunicado'],
        ['A.6.1.2', 'Gestión de recursos', 'No cumple', 'Falta documentación de contratos'],
        ['A.9.2.3', 'Control de acceso', 'Cumple parcialmente', 'Implementado pero necesita mejora'],
        ['A.12.1.1', 'Gestión de cambios', 'Cumple', 'Proceso documentado y funcionando'],
        ['A.15.1.1', 'Relación con proveedores', 'No cumple', 'Falta evaluación de riesgos']
    ];
    
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Evaluación');
    XLSX.writeFile(workbook, './ejemplos/test-observaciones.xlsx');
    
    console.log('📄 Archivo Excel creado con datos de prueba...');
    
    // Probar extracción de observaciones
    const options = {
        extractionType: 'specific',
        specificFields: ['observaciones']
    };
    
    try {
        console.log('🔍 Buscando "observaciones"...');
        const result = await extractor.extractFromFile('./ejemplos/test-observaciones.xlsx', options);
        
        console.log('📋 Resultado de extracción:');
        console.log('==========================');
        console.log(`✅ Éxito: ${result.success}`);
        console.log(`📄 Archivo: ${result.fileName}`);
        console.log(`📊 Hojas: ${result.data.sheetNames.join(', ')}`);
        
        result.data.sheets.forEach(sheet => {
            console.log(`\n📊 Hoja "${sheet.name}":`);
            console.log(`   - Filas: ${sheet.rowCount}`);
            console.log(`   - Columnas: ${sheet.columnCount}`);
            console.log(`   - Datos extraídos:`);
            sheet.data.forEach((row, index) => {
                console.log(`     Fila ${index + 1}: ${JSON.stringify(row)}`);
            });
        });
        
        // Probar con diferentes palabras clave
        console.log('\n🧪 Probando diferentes palabras clave...');
        
        const keywords = ['observaciones', 'estado', 'control', 'descripción'];
        
        for (const keyword of keywords) {
            const keywordOptions = {
                extractionType: 'specific',
                specificFields: [keyword]
            };
            
            const keywordResult = await extractor.extractFromFile('./ejemplos/test-observaciones.xlsx', keywordOptions);
            console.log(`\n📊 Palabra clave "${keyword}":`);
            keywordResult.data.sheets.forEach(sheet => {
                console.log(`   Hoja "${sheet.name}":`);
                sheet.data.forEach((row, index) => {
                    console.log(`     Fila ${index + 1}: ${JSON.stringify(row)}`);
                });
            });
        }
        
    } catch (error) {
        console.error('❌ Error durante la prueba:', error.message);
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    testExcelObservaciones().catch(console.error);
}

module.exports = { testExcelObservaciones }; 