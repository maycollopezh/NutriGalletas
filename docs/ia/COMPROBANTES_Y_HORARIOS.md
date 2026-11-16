# Horarios y comprobantes de pedidos por WhatsApp

## Recogida

La interpretación de la fecha y hora se hace antes de consultar al modelo cuando el cliente está completando un pedido. Se admiten «mañana a las 3 de la tarde», «mañana a las 9 de la mañana», «15:00», «3:00pm», am/pm y fechas explícitas. Si falta el día o el período, se conserva la información y se pregunta solo lo que falta. Se mantiene la validación del horario real, días habilitados y preparación mínima de la tienda, en hora de Bolivia.

## Comprobantes

La imagen se guarda en almacenamiento privado y OpenAI extrae importe, moneda, destinatario y referencia. Esto es una lectura preliminar: no autentica una transferencia. La comparación y suma monetaria se hacen en PostgreSQL.

- **Parcial:** los comprobantes distintos, legibles, en BOB, con destinatario coincidente y referencia visible se suman. Si faltan Bs 1 para un pedido de Bs 21, el cliente recibe ese saldo y el QR para pagar únicamente Bs 1. El siguiente comprobante se añade al anterior.
- **Exacto:** se avisa al personal para verificar en el banco el total realmente abonado. No se registra la venta por la imagen.
- **Excedente:** se muestra el posible cambio, se crea una solicitud de atención humana y se pausa la IA de ese cliente. El equipo responde en YCloud y luego puede reanudarla desde la bandeja.
- **Dudoso:** si faltan datos, el destino no coincide o la evidencia aparece en otro pedido, se deriva a una persona sin pedir automáticamente otro pago.
- **Duplicado:** una referencia o huella de imagen ya recibida no suma dos veces.

El primer comprobante recibido dentro del plazo detiene el vencimiento automático y conserva la reserva durante la revisión, también si el importe es parcial. El equipo debe resolver esos pedidos; no se liberan automáticamente productos cuando puede existir dinero abonado.

## Web

«Pedidos para recoger» permite a los roles ya autorizados abrir todos los comprobantes y ver la suma preliminar. Antes de confirmar una venta, deben escribir el importe realmente recibido y marcar la verificación bancaria. El servidor bloquea importes inferiores al total. Si hay excedente, deben reconocer el cambio pendiente y coordinarlo con el cliente. El sistema no devuelve dinero automáticamente.

La migración 010 conserva ventas y pedidos existentes. Los comprobantes anteriores quedan disponibles para revisión manual y no se recalifican automáticamente como pagos correctos.

## Publicación y validación

Se prepararon los archivos y la función sin ejecutar pruebas funcionales ni enviar mensajes de prueba. El propietario realizará la comprobación final. Las plantillas de pago fuera de las 24 horas continúan deshabilitadas.
