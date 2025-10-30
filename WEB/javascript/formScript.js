(function() {
    var syncLock = false;
    function syncGroup(groupId, source) {
        if (syncLock) return;
        syncLock = true;
        var tables = document.querySelectorAll('table.table[data-group="' + groupId + '"]');
        var isRadio = source.type === 'radio';
        var isDate = source.type === 'date';
        tables.forEach(function(tb) {
            if (isDate) {
                tb.querySelectorAll('input.date-input').forEach(function(input) {
                    input.value = source.value;
                });
            }
            if (isRadio) {
                var val = source.value;
                tb.querySelectorAll('input[type="radio"]').forEach(function(r) {
                    r.checked = (r.value === val);
                });
            }
        });
        syncLock = false;
    }

    document.querySelectorAll('table.table[data-group]').forEach(function(tb) {
        var groupId = tb.getAttribute('data-group');
        tb.addEventListener('change', function(e) {
            var target = e.target;
            if (target && (target.matches('input.date-input') || target.matches('input[type="radio"]'))) {
                syncGroup(groupId, target);
            }
        });
    });
})();