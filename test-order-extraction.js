const ExtractorDatos = require('./index');
const fs = require('fs');

async function testOrderExtraction() {
    console.log('🧪 Probando extracción de números de orden...\n');
    
    const extractor = new ExtractorDatos();
    
    // Crear un archivo de prueba con contenido similar al PDF
    const testContent = `
    Marcos Cabral Confirmation for Order 119011270 1 mensaje us.customer.service@prodirectsport.com 26 de noviembre de 2024, 8:20 p.m.
    
    Para: "mcabral1902@gmail.com" Thanks for going pro! Hi Marcos, thanks for choosing Pro:Direct Sport.
    
    We have successfully received your order.
    
    Your order number is: 119011270 Product Size Qty Price Nike Tiempo Legend X Academy AG - Black/Chrome/Hyper Royal 12 1 $68.00 Delivery Service Ground Delivery Please note that personalised products may take a little longer to be dispatched.
    
    Sub Total $68.00 Discount $0.00 Shipping Cost $5.00 Total Ex VAT $73.00 Estimated VAT $5.11 TOTAL $78.11 Shipping Address Please note
    `;
    
    fs.writeFileSync('./ejemplos/test-order.txt', testContent);
    
    // Probar extracción de número de orden
    const options = {
        extractionType: 'specific',
        specificFields: ['order']
    };
    
    try {
        const result = await extractor.extractFromFile('./ejemplos/test-order.txt', options);
        
        console.log('📋 Resultado de extracción de número de orden:');
        console.log('=============================================');
        console.log(`✅ Éxito: ${result.success}`);
        console.log(`📄 Archivo: ${result.fileName}`);
        console.log(`📝 Texto extraído (${result.data.text.length} caracteres):`);
        console.log('----------------------------------------');
        console.log(result.data.text);
        console.log('----------------------------------------');
        
        // Probar con diferentes patrones
        console.log('\n🧪 Probando diferentes patrones...');
        
        const patterns = ['order', 'email', 'price', 'phone'];
        
        for (const pattern of patterns) {
            const patternOptions = {
                extractionType: 'specific',
                specificFields: [pattern]
            };
            
            const patternResult = await extractor.extractFromFile('./ejemplos/test-order.txt', patternOptions);
            console.log(`\n📊 Patrón "${pattern}":`);
            console.log(patternResult.data.text);
        }
        
    } catch (error) {
        console.error('❌ Error durante la prueba:', error.message);
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    testOrderExtraction().catch(console.error);
}

module.exports = { testOrderExtraction }; 