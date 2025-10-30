let html5QrcodeScanner = null;

        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const resultDiv = document.getElementById('result');
        

        

        // 扫描成功回调
        function onScanSuccess(decodedText, decodedResult) {
            console.log(`扫描成功: ${decodedText}`, decodedResult);
            
            // 显示结果
            resultDiv.className = 'success-result';
            resultDiv.textContent = decodedText;

            

            // 播放提示音（可选）
            try {
                const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGS77+ipUxELTqni+a5jHAc5j9bz0X8sBS1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGS55+mrUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0X8sBi1+zPLaizsKGGS55+mqUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsKGGO55+mrUxELTqfi+a1jHAc5j9bz0YAsBi1+zPLaizsK');
                audio.play();
            } catch (e) {
                console.log('Unable to play notification sound');
            }

			// 调用后端 API 并跳转到表单选择页
			(async () => {
				const cserial = (decodedText || '').trim();
				if (!cserial) return;
				try {
					if (html5QrcodeScanner) {
						await html5QrcodeScanner.stop().catch(() => {});
						startBtn.disabled = false;
						stopBtn.disabled = true;
					}
					const resp = await fetch('http://localhost:5202/itx-barcode-data', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ cserial_no: cserial })
					});
					if (!resp.ok) {
						throw new Error(`API error ${resp.status}`);
					}
					const data = await resp.json();
					sessionStorage.setItem('itxBarcodeResult', JSON.stringify(data));
					// 记录原始 cserial_no，供标题显示
					sessionStorage.setItem('itxCserialNo', cserial);
					window.location.href = './views/turnPage.html';
				} catch (err) {
					console.error(err);
					alert('Template status query failed, please try again.');
				}
			})();
        }

        // 扫描失败回调（可选）
        function onScanError(errorMessage) {
            // 不需要对每个错误都做处理，扫描过程中会有很多失败
            // console.log(`扫描错误: ${errorMessage}`);
        }

        // 开始扫描
        startBtn.addEventListener('click', function() {
            // 确保存在扫码容器
            let readerEl = document.getElementById('reader');
            if (!readerEl) {
                readerEl = document.createElement('div');
                readerEl.id = 'reader';
                document.querySelector('.scanner-container')?.appendChild(readerEl);
            }
            html5QrcodeScanner = new Html5Qrcode('reader');
            
            const readerRect = readerEl.getBoundingClientRect();
            const config = {
                fps: 10,
                qrbox: { width: Math.floor(readerRect.width), height: Math.floor(readerRect.height) },
                aspectRatio: readerRect.width / Math.max(1, readerRect.height)
            };

            // 启动相机扫描
            html5QrcodeScanner.start(
                { facingMode: "environment" },  // 使用后置摄像头
                config,
                onScanSuccess,
                onScanError
            ).then(() => {
                startBtn.disabled = true;
                stopBtn.disabled = false;
                resultDiv.className = 'no-result';
                resultDiv.textContent = 'Scanning...';
            }).catch(err => {
                alert(`Cannot start camera: ${err}`);
                console.error(err);
            });
        });

        // 停止扫描
        stopBtn.addEventListener('click', function() {
            if (html5QrcodeScanner) {
                html5QrcodeScanner.stop().then(() => {
                    startBtn.disabled = false;
                    stopBtn.disabled = true;
                    resultDiv.className = 'no-result';
                    resultDiv.textContent = 'Scanning stopped';
                }).catch(err => {
                    console.error(err);
                });
            }
        });

        