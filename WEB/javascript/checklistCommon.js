(function() {
  function getQueryParam(name){ try { const url=new URL(window.location.href); return url.searchParams.get(name); } catch(e){ return null; } }

  async function fetchJson(url, payload){
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload||{}) });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, data };
  }

  function setSectionDates(prefix, dt) {
    const v = dt ? (new Date(dt)).toISOString().slice(0,10) : '';
    document.querySelectorAll('input.date-input[name^="'+prefix+'"]').forEach(i => { i.value = v; });
  }

  function setSectionRadios(prefix, isPass) {
    const names = new Set();
    document.querySelectorAll('input[type="radio"][name^="'+prefix+'"]').forEach(r => names.add(r.name));
    names.forEach(n => {
      const target = document.querySelector('input[type="radio"][name="'+n+'"][value="'+(isPass ? 'pass' : 'fail')+'"]');
      if (target) target.checked = true;
    });
  }

  function collectDates(prefix) {
    return Array.from(document.querySelectorAll('input.date-input[name^="'+prefix+'"]')).map(i => i.value).filter(Boolean);
  }

  function collectRadios(prefix) {
    const names = new Set();
    Array.from(document.querySelectorAll('input[type="radio"][name^="'+prefix+'"]')).forEach(r => names.add(r.name));
    const vals = []; names.forEach(n => { const checked = document.querySelector('input[type="radio"][name="'+n+'"]:checked'); if (checked) vals.push(checked.value); });
    return vals;
  }

  function disableAllInputs() {
    document.querySelectorAll('input, textarea, select, button[type="submit"]').forEach(el => {
      if (el.id === 'chassisNo') return;
      if (el.type === 'button') return;
      el.disabled = true;
      if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'date')) el.readOnly = true;
    });
  }

  async function initChecklistForm(partName) {
    const readonly = getQueryParam('readonly') === '1';

    // chassis no
    const chassisNoInput = document.getElementById('chassisNo');
    if (chassisNoInput) {
      let cserialNo = sessionStorage.getItem('itxCserialNo');
      const cserialFromQuery = getQueryParam('cserial');
      if (!cserialNo && cserialFromQuery) cserialNo = cserialFromQuery;
      if (cserialNo) chassisNoInput.value = cserialNo;
    }

    if (readonly) {
      disableAllInputs();
      const cserial = chassisNoInput?.value || '';
      if (!cserial) return;
      const { ok, data } = await fetchJson('http://localhost:5202/get-checklist', { cserial_no: cserial, reman_part: partName });
      if (!ok || !data || !data.record) return;
      const rec = data.record;
      // basics
      const operatorNameInput = document.getElementById('operatorName'); if (operatorNameInput) operatorNameInput.value = rec.OperatorNM || '';
      const supervisorNameInput = document.getElementById('supervisorName'); if (supervisorNameInput) supervisorNameInput.value = rec.SupervisorNM || '';
      const dateInInput = document.getElementById('dateIn'); if (dateInInput && rec.Date_In) dateInInput.value = (new Date(rec.Date_In)).toISOString().slice(0,10);
      const dateOutInput = document.getElementById('dateOut'); if (dateOutInput && rec.Date_Out) dateOutInput.value = (new Date(rec.Date_Out)).toISOString().slice(0,10);
      // sections
      setSectionDates('sec1_', rec.Cat1_dt);
      setSectionRadios('sec1_', !!rec.Cat1_Status);
      setSectionDates('sec2_', rec.Cat2_dt);
      setSectionRadios('sec2_', !!rec.Cat2_Status);
      setSectionDates('sec3_', rec.Cat3_dt);
      setSectionRadios('sec3_', String(rec.Cat3_Status||'').toUpperCase()==='OK');
      // remarks
      const rems = []; for (let i=1;i<=27;i++){ rems.push(rec['Rem'+i] || ''); }
      const remarkInputs = Array.from(document.querySelectorAll('.remark_input'));
      for (let i=0;i<remarkInputs.length && i<rems.length;i++) remarkInputs[i].value = rems[i];
      return; // readonly ends here
    }

    // non-readonly: fetch user and bind submit
    const userEmail = localStorage.getItem('itx_userEmail');
    if (userEmail) {
      try {
        const { ok, data } = await fetchJson('http://localhost:5202/get-user-info', { email: userEmail });
        if (ok && data && data.user) {
          const operatorNameInput = document.getElementById('operatorName'); if (operatorNameInput && data.user.name) operatorNameInput.value = data.user.name;
          const supervisorNameInput = document.getElementById('supervisorName'); if (supervisorNameInput && data.user.manager) supervisorNameInput.value = data.user.manager;
        }
      } catch (e) {}
    }

    const formEl = document.querySelector('form.page');
    formEl && formEl.addEventListener('submit', async function(e) {
      e.preventDefault();
      const cserial = (document.getElementById('chassisNo')?.value || '').trim();
      const operatorName = document.getElementById('operatorName')?.value || '';
      const supervisorName = document.getElementById('supervisorName')?.value || '';
      const dateIn = (document.getElementById('dateIn')?.value || '').trim();
      const dateOut = (document.getElementById('dateOut')?.value || '').trim();
      if (!cserial) { alert('Missing chassis no.'); return; }

      const section1Dates = collectDates('sec1_');
      const section2Dates = collectDates('sec2_');
      const section3Dates = collectDates('sec3_');
      const section1Radios = collectRadios('sec1_');
      const section2Radios = collectRadios('sec2_');
      const section3Radios = collectRadios('sec3_');
      const remarks = Array.from(document.querySelectorAll('.remark_input')).map(i => (i.value || '').trim());

      try {
        const { ok, data } = await fetchJson('http://localhost:5202/submit-checklist', {
          cserial_no: cserial,
          reman_part: partName,
          date_in: dateIn,
          date_out: dateOut,
          operator_name: operatorName,
          supervisor_name: supervisorName,
          section1_dates: section1Dates,
          section2_dates: section2Dates,
          section3_dates: section3Dates,
          section1_radios: section1Radios,
          section2_radios: section2Radios,
          section3_radios: section3Radios,
          remarks
        });
        if (!ok || !data || !data.success) { alert((data && data.message) || 'Submit failed'); return; }
        alert('Saved successfully. WO No: ' + data.wo_no);
        window.location.href = '../views/turnPage.html';
      } catch(e) { console.error(e); alert('Submit failed'); }
    });
  }

  // expose
  window.initChecklistForm = initChecklistForm;
})();
