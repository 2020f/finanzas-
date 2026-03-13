async function test() {
    const url = "https://script.google.com/macros/s/AKfycbzrYMxmYFHHQrKVHttmiAA0qWaaxde65_oghQ7O1_ffnYgrWM3K5VEYBaPesuuB9h_3Sw/exec";
    const payload = {
        id: "test",
        fecha: "2026-03-13",
        tipo: "Ingreso",
        categoria: "Test",
        descripcion: "Test desde terminal JS",
        metodoDePago: "Test",
        monto: 999,
        cuenta: "Test"
    };

    try {
        console.log("Sending...");
        const response = await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        console.log("Status:", response.status);
        console.log("Type:", response.type);
        console.log("OK:", response.ok);
        console.log("Done.");
    } catch (e) {
        console.error("Error:", e);
    }
}
test();
