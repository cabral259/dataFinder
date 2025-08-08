const ExtractorDatos = require('./index');
const fs = require('fs');
const path = require('path');

// Función para crear archivos de ejemplo
function createSampleFiles() {
    console.log('📁 Creando archivos de ejemplo...');
    
    // Crear directorio de ejemplos si no existe
    const examplesDir = './ejemplos';
    if (!fs.existsSync(examplesDir)) {
        fs.mkdirSync(examplesDir);
    }

    // Crear archivo Excel de ejemplo
    const XLSX = require('xlsx');
    const workbook = XLSX.utils.book_new();
    
    const data = [
        ['Nombre', 'Email', 'Teléfono', 'Empresa'],
        ['Juan Pérez', 'juan@ejemplo.com', '123-456-7890', 'TechCorp'],
        ['María García', 'maria@ejemplo.com', '098-765-4321', 'DataSoft'],
        ['Carlos López', 'carlos@ejemplo.com', '555-123-4567', 'InnovateLab']
    ];
    
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Empleados');
    XLSX.writeFile(workbook, './ejemplos/empleados.xlsx');
    
    // Crear archivo de texto simple (simulando contenido de Word)
    const wordContent = `
    REPORTE DE VENTAS - Q1 2024
    
    Resumen Ejecutivo:
    - Ventas totales: $150,000
    - Clientes nuevos: 25
    - Producto más vendido: Software CRM
    
    Detalles por Región:
    Norte: $45,000
    Sur: $38,000
    Este: $42,000
    Oeste: $25,000
    
    Conclusiones:
    El primer trimestre mostró un crecimiento del 15% 
    comparado con el mismo período del año anterior.
    `;
    
    fs.writeFileSync('./ejemplos/reporte.txt', wordContent);
    
    console.log('✅ Archivos de ejemplo creados en ./ejemplos/');
}

// Función principal de prueba
async function runTests() {
    console.log('🚀 Iniciando pruebas del extractor de datos...\n');
    
    const extractor = new ExtractorDatos();
    
    // Crear archivos de ejemplo
    createSampleFiles();
    
    // Lista de archivos a procesar
    const testFiles = [
        './ejemplos/empleados.xlsx'
    ];
    
    console.log('📊 Procesando archivos...\n');
    
    try {
        // Procesar archivos
        const results = await extractor.extractFromMultipleFiles(testFiles);
        
        // Mostrar resultados
        results.forEach((result, index) => {
            console.log(`📄 Archivo ${index + 1}: ${result.fileName}`);
            console.log(`📋 Tipo: ${result.fileType}`);
            console.log(`✅ Éxito: ${result.success}`);
            
            if (result.success) {
                console.log('📊 Datos extraídos:');
                
                if (result.fileType === '.xlsx' || result.fileType === '.xls') {
                    console.log(`   - Hojas encontradas: ${result.data.sheetNames.join(', ')}`);
                    result.data.sheets.forEach(sheet => {
                        console.log(`   - Hoja "${sheet.name}": ${sheet.rowCount} filas, ${sheet.columnCount} columnas`);
                        console.log('   - Primeras filas:');
                        sheet.data.slice(0, 3).forEach(row => {
                            console.log(`     ${JSON.stringify(row)}`);
                        });
                    });
                }
                
                console.log(`   - Extraído el: ${result.extractedAt}`);
            } else {
                console.log(`❌ Error: ${result.error}`);
            }
            
            console.log(''); // Línea en blanco
        });
        
        // Mostrar estadísticas
        const stats = extractor.getExtractionStats(results);
        console.log('📈 Estadísticas:');
        console.log(`   - Total de archivos: ${stats.totalFiles}`);
        console.log(`   - Exitosos: ${stats.successful}`);
        console.log(`   - Fallidos: ${stats.failed}`);
        console.log(`   - Por tipo: ${JSON.stringify(stats.byType)}`);
        
    } catch (error) {
        console.error('❌ Error durante las pruebas:', error.message);
    }
}

// Función para probar con archivos reales
async function testWithRealFiles() {
    console.log('\n🔍 Para probar con archivos reales:');
    console.log('1. Coloca tus archivos en la carpeta ./ejemplos/');
    console.log('2. Modifica la lista testFiles en test.js');
    console.log('3. Ejecuta: node test.js\n');
    
    const examplesDir = './ejemplos';
    if (fs.existsSync(examplesDir)) {
        const files = fs.readdirSync(examplesDir);
        if (files.length > 0) {
            console.log('📁 Archivos encontrados en ./ejemplos/:');
            files.forEach(file => {
                const ext = path.extname(file).toLowerCase();
                const supported = ['.pdf', '.xlsx', '.xls', '.docx', '.doc'].includes(ext);
                console.log(`   ${file} ${supported ? '✅' : '❌'} (${supported ? 'soportado' : 'no soportado'})`);
            });
        }
    }
}

// Ejecutar pruebas
if (require.main === module) {
    runTests().then(() => {
        testWithRealFiles();
    }).catch(console.error);
} 