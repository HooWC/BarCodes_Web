(function() {
	try {
		// 设置标题为扫描到的 cserial_no
		const cno = sessionStorage.getItem('itxCserialNo');
		if (cno) {
			const titleEl = document.querySelector('.title');
			if (titleEl) titleEl.textContent = cno;
		}

		const raw = sessionStorage.getItem('itxBarcodeResult');
		if (!raw) return;
		const data = JSON.parse(raw);
		const parts = Array.isArray(data && data.parts) ? data.parts : [];
		const map = new Map(parts.map(p => [String(p.name || '').trim().toUpperCase(), !!p.exists]));

		document.querySelectorAll('.grid .card').forEach(card => {
			const labelEl = card.querySelector('.card-text');
			if (!labelEl) return;
			const name = labelEl.textContent.trim().toUpperCase();
			const exists = map.get(name) === true;

			if (exists) {
				// 高亮并禁用进入
				card.style.boxShadow = '0 0 0 3px #4ade80 inset';
				card.style.background = 'rgba(74, 222, 128, 0.15)';
				card.style.cursor = 'default';
				card.setAttribute('aria-disabled', 'true');
				card.style.pointerEvents = 'none';
				labelEl.textContent = name + ' (READY)';
			} else {
				// 可进入
				card.style.opacity = '1';
				card.style.pointerEvents = 'auto';
			}
		});
	} catch (e) {
		console.error('Failed to apply barcode result on turnPage:', e);
	}
})();