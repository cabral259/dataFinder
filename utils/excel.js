import ExcelJS from 'exceljs';

export async function generateExcel(data) {
  console.log('📊 Generando Excel con exceljs...');
  
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Datos Extraídos');

  // Configurar columnas
  worksheet.columns = [
    { header: 'Campo', key: 'label', width: 30 },
    { header: 'Valor', key: 'value', width: 50 },
  ];

  // Agregar datos
  data.forEach(item => {
    worksheet.addRow(item);
  });

  // Aplicar estilos básicos
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  // Generar buffer
  const buffer = await workbook.xlsx.writeBuffer();
  console.log('✅ Excel generado con exceljs:', buffer.length, 'bytes');
  
  return buffer;
}
