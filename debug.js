const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');

async function debugPDF(filePath) {
    try {
        console.log('🔍 Debugging PDF extraction...');
        console.log(`📄 Archivo: ${filePath}`);
        
        // Verificar que el archivo existe
        if (!fs.existsSync(filePath)) {
            console.log('❌ El archivo no existe');
            return;
        }
        
        // Obtener información del archivo
        const stats = fs.statSync(filePath);
        console.log(`📊 Tamaño: ${stats.size} bytes`);
        
        // Leer el archivo
        const dataBuffer = fs.readFileSync(filePath);
        console.log(`📖 Buffer leído: ${dataBuffer.length} bytes`);
        
        // Intentar parsear el PDF
        console.log('🔄 Parseando PDF...');
        
        // Cargar el PDF usando pdfjs-dist
        const loadingTask = pdfjsLib.getDocument({data: new Uint8Array(dataBuffer)});
        const pdf = await loadingTask.promise;
        
        let extractedText = '';
        const numPages = pdf.numPages;
        
        // Extraer texto de cada página
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            // Concatenar el texto de la página
            const pageText = textContent.items
                .map(item => item.str)
                .join(' ');
            
            extractedText += pageText + '\n';
        }
        
        console.log('\n📋 RESULTADOS DEL PARSING:');
        console.log('========================');
        console.log(`📄 Número de páginas: ${numPages}`);
        console.log(`📝 Longitud del texto: ${extractedText.length} caracteres`);
        console.log(`📊 Información:`, {});
        console.log(`🔍 Metadatos:`, {});
        
        console.log('\n📝 TEXTO EXTRAÍDO:');
        console.log('==================');
        console.log(extractedText.trim());
        
        // Verificar si el texto está vacío o es muy corto
        if (extractedText.trim().length < 50) {
            console.log('\n⚠️  ADVERTENCIA: El texto extraído es muy corto o está vacío');
            console.log('Esto puede indicar que:');
            console.log('- El PDF está protegido con contraseña');
            console.log('- El PDF contiene solo imágenes');
            console.log('- El PDF está corrupto');
            console.log('- El PDF usa fuentes no estándar');
        }
        
    } catch (error) {
        console.error('❌ Error durante la extracción:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

// Función para listar archivos en la carpeta uploads
function listUploadedFiles() {
    const uploadsDir = './uploads';
    if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        console.log('\n📁 Archivos en carpeta uploads:');
        files.forEach(file => {
            const filePath = path.join(uploadsDir, file);
            const stats = fs.statSync(filePath);
            console.log(`  - ${file} (${stats.size} bytes)`);
        });
    } else {
        console.log('\n📁 No existe carpeta uploads');
    }
}

// Función para listar archivos en la carpeta ejemplos
function listExampleFiles() {
    const examplesDir = './ejemplos';
    if (fs.existsSync(examplesDir)) {
        const files = fs.readdirSync(examplesDir);
        console.log('\n📁 Archivos en carpeta ejemplos:');
        files.forEach(file => {
            const filePath = path.join(examplesDir, file);
            const stats = fs.statSync(filePath);
            console.log(`  - ${file} (${stats.size} bytes)`);
        });
    } else {
        console.log('\n📁 No existe carpeta ejemplos');
    }
}

// Función principal
async function main() {
    console.log('🚀 Iniciando diagnóstico del extractor PDF...\n');
    
    // Listar archivos disponibles
    listUploadedFiles();
    listExampleFiles();
    
    // Si se proporciona un archivo específico como argumento
    const targetFile = process.argv[2];
    
    if (targetFile) {
        await debugPDF(targetFile);
    } else {
        // Probar con archivos de ejemplo
        const testFiles = [
            './ejemplos/empleados.xlsx',
            // Agregar aquí otros archivos de prueba
        ];
        
        for (const file of testFiles) {
            if (fs.existsSync(file)) {
                console.log(`\n🧪 Probando archivo: ${file}`);
                if (path.extname(file).toLowerCase() === '.pdf') {
                    await debugPDF(file);
                } else {
                    console.log('⚠️  No es un archivo PDF, saltando...');
                }
            }
        }
        
        console.log('\n💡 Para probar un archivo específico:');
        console.log('node debug.js ruta/al/archivo.pdf');
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { debugPDF }; 