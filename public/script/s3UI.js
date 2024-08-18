//Insert simple loading gif
function insertLoading(htmlId) {
    document.getElementById(htmlId).insertAdjacentHTML('beforeend', '<div id=\"loading\" class=\"loading\" order=\"1\"></div>')
}
function removeElementById(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.remove();
    }
}

//Hide all opened forms in header
function clearFunctionForms() {
    const functionDivs = document.getElementsByClassName('S3_Function');
    for ( let div = 0; div < functionDivs.length; div++ ) {
        if (functionDivs[div].style.display !== 'none') {
            functionDivs[div].style.display = 'none';
        }
    }
}

function clearFocus() {
    let buttonList = document.getElementsByClassName('S3_Filepick_UI');
    buttonList['NavButton'] = document.getElementById('S3_UI_NavBar').lastChild;
    for (e in buttonList) {
        let classes = buttonList[e].classList;
        if (classes != undefined && classes.contains('filebrowser_focused')) {
            classes.remove('filebrowser_focused');
        } else if (classes != undefined && classes.contains('navbar_focused')) {
            classes.remove('navbar_focused');
        }
    }
}

//If click on non-interactive element, clear everything. Tied to "background" class. 
function clearTarget() {
    s3Targets = [];
    document.getElementById('S3_Filepick_Select').value = '';
    clearFocus();
    clearFunctionForms();
}

//Change CSS style to display element
function displayItemById(htmlId) {
    if (document.getElementById(htmlId).style.display === 'none') {
        clearFunctionForms();
        document.getElementById(htmlId).style.display = 'flex';
    } else {
        document.getElementById(htmlId).style.display = 'none';
    } 
}

function classControl(htmlId, classString) {
    if (htmlId != undefined) {
        const htmlClass = document.getElementById(htmlId).classList;
        if (htmlClass.contains(classString)) {
            htmlClass.remove(classString);
        } else {
            htmlClass.add(classString);
        }
    }
}

//Ensure that no illegal characters are entered.
//See https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html for reference.
function sanitize(inputString) {
    const pattern = /^[A-Za-z0-9!._*'()\-\s]*$/;
    return pattern.test(inputString)
}

function dirLVlFromKey(splitPath) {
    if (splitPath[0] == '') {
        dirLvl = splitPath.length - 2;
    } else {
        dirLvl = splitPath.length - 1;
    }
}

//Construct directory in UI
function s3InitializeUI(s3Keys, search) {
    s3Targets = [];
    if (search == false) { 
        clearFunctionForms();
        var s3FilepickerUI = document.getElementById('S3_Filepick_UI');
        if (s3FilepickerUI.style.display === 'none') {
            const searchUI = document.getElementById('S3_Search_Results');
            searchUI.style.display = 'none';
            searchUI.innerHTML = '';
            s3FilepickerUI.style.display = 'flex';
        }
    } else {
        var s3FilepickerUI = document.getElementById('S3_Search_Results');
    }
    s3FilepickerUI.innerHTML = '';
    var s3ListRunningId = 0;
    //Buttons and entries within UI are created here.
    for (s3Entry in s3Keys) {
        //Ensure we have a valid S3 Object, and Key is not itself a directory within. 
        if (s3Entry != 'total' && s3Keys[s3Entry].hasOwnProperty('Key') && (typeof s3Keys[s3Entry].Key) === 'string') {
            let dirName;
            let currentS3Key = s3Keys[s3Entry].Key;
            let path = currentS3Key.split('/');
            //Pretty names
            if (currentS3Key.startsWith('/') && dirLvl === 0 && s3Keys[s3Entry].Size === 0) {
                dirName = `/${path[path.length - 2]}`;
            } else if (currentS3Key.endsWith('/') && s3Keys[s3Entry].Size === 0) {
                dirName = `${path[path.length - 2]}`
            } else {
                dirName = `${path[path.length - 1]}`;
            }
            if (dirName.endsWith('/')) {
                dirName = dirName.slice(0, -1);
            }
            //Pretty icons for pretty buttons
            if (s3Keys[s3Entry].Size > 0) {
                var IconSrc = 'graphics/FileIconCC.svg';
            } else {
                var IconSrc = 'graphics/DirIconCC.svg';
            }
            let button = document.createElement('button');
            let buttonId = `S3_Filepick_Btn_${s3ListRunningId}`;
            button.id = buttonId;
            button.className = 'S3_Filepick_UI';
            button.innerHTML = `<div class="S3_UI_Button_Inner"><img src=\"${IconSrc}\"><br>${dirName}</div>`;
            s3FilepickerUI.appendChild(button);
            document.getElementById(buttonId).addEventListener( 'click', function(){ s3UIHandleButton(currentS3Key, buttonId) } );
            s3ListRunningId += 1;
        }
    };
};

//Code to handle navigation and forward appropriate values to other functions.
function s3UIHandleButton(s3Key, buttonId) {
    classControl(buttonId, 'filebrowser_focused');
    //Ensure that no active messages remain in navigation bar.
    removeElementById('S3_UI_Msg');
    //Check if target is a file or a directory and act accordingly.
    const traverseJson = (s3Objects, s3Key) => {
        for (s3Object in s3Objects) {
            if (s3Objects[s3Object].hasOwnProperty('Key') && s3Objects[s3Object].Key === s3Key) {
                //Check for empty directory
                if (Object.keys(s3Objects[s3Object]).length <= 3 && s3Objects[s3Object].Size === 0) {
                    document.getElementById('S3_UI_NavBar').insertAdjacentHTML('beforeend', '<p id=\"S3_UI_Msg\">Directory empty.</p>');
                //If object is file then this is quick.
                } else if (Object.keys(s3Objects[s3Object]).length <= 3 && s3Objects[s3Object].Size > 0) {
                    const lastNavId = document.getElementById('S3_UI_NavBar').lastChild.id;
                    const lastNavButton = document.getElementById(lastNavId);
                    if (lastNavButton != null && lastNavButton.classList.contains('navbar_focused')) {
                        lastNavButton.classList.remove('navbar_focused');
                    }
                    if (!Array.isArray(s3Targets)) {
                        s3Targets = [s3Key];
                    } else if (!s3Targets.includes(s3Key)) {
                        s3Targets.push(s3Key);
                    } else if (s3Targets.includes(s3Key)) {
                        s3Targets = s3Targets.filter(key => key !== s3Key);
                    }
                    if (s3Targets.length === 1) {
                        document.getElementById('Copy_Link').disabled = false;
                    } else {
                        document.getElementById('Copy_Link').disabled = true;
                    }
                    //If in an iframe, dispatch event back to overarching site.
                    if (iframeResult === true) {
                        const filepickSelect = document.getElementById('S3_Filepick_Select');
                        filepickSelect.value = s3Key
                        const event = new Event('change', { bubbles: true });
                        filepickSelect.dispatchEvent(event);
                    }
                    if (document.getElementById('S3_Download').style.display === 'none') {
                        displayItemById('S3_Download'); 
                    } else if (s3Targets == 0) {
                        clearFunctionForms();
                    }
                    event.stopPropagation();
                    return
                }
                //Set global variables.
                uploadInput = s3Key;
                s3Targets = [];
                const path = s3Key.split('/');
                dirLVlFromKey(path);
                const navDiv = document.getElementById('S3_UI_NavBar');
                var buttonTarget = '';
                currentTarget = s3Objects[s3Object]
                //Loop through key to create nav bar
                for (let i = 1; i <= dirLvl; i++) {
                    removeElementById(`${i}_nav_btn`);
                    let navButton = document.createElement('button');
                    navButton.id = `${i}_nav_btn`;
                    var navButtonText = '';
                    //Handle exceptions caused by S3 object keys starting with /
                    if (i == 1 && s3Key.startsWith('/')) {
                        navButtonText = `/${path[i]}`;
                    } else if (s3Key.startsWith('/')) {
                        navButtonText = `${path[i]}`;
                    } else {
                        navButtonText = path[i-1];
                    }
                    buttonTarget = buttonTarget.concat(`${navButtonText}/`);
                    const localTarget = buttonTarget;
                    navButton.innerHTML = `<img src=\"graphics/OpenDirIconCC.svg\">${navButtonText}`;
                    navDiv.appendChild(navButton);
                    document.getElementById(`${i}_nav_btn`).addEventListener( 'click', function(){ s3NavButton(i, localTarget) } );
                }
                s3InitializeUI(s3Objects[s3Object], false);
                event.stopPropagation();
                return
            } else if ( (typeof s3Objects[s3Object]) === 'object' && Object.keys(s3Objects[s3Object]).length > 3 ) {
                traverseJson(s3Objects[s3Object], s3Key);
            }
        };
    };
    traverseJson(s3KeysGlobalVar, s3Key);
};

//Code to handle events in nav bar.
function s3NavButton(targetLvl, s3Key) {
    removeElementById('S3_UI_Msg');
    if (targetLvl === dirLvl) {
        clearFocus();
        classControl(document.getElementById('S3_UI_NavBar').lastChild.id, 'navbar_focused');
        //Check if we're home
        if (s3Key === '') {
            s3Targets = '/';
            uploadInput = '/'
        } else {
            uploadInput = s3Key;
            s3Targets = currentTarget;
        }
        return;
    }
    for (let i = dirLvl; i >= targetLvl && i !== 0; i--) {
        let navBtnString = `${i}_nav_btn`;
        removeElementById(navBtnString);
    }
    if (targetLvl === 0) {
        dirLvl = targetLvl;
        uploadInput = '/';
        s3InitializeUI(s3KeysGlobalVar, false);
    } else {
        dirLvl = targetLvl - 1;
        s3UIHandleButton(s3Key, undefined);
    }
}

//Send array of keys back to server for S3 API calls.
function sendS3Keys(targetUrl, s3Array) {
    if (targetUrl.includes('download') && s3Array.length > 1) {
        removeElementById('loading');
        document.getElementById('multiDlInput').value = JSON.stringify(s3Array);
        document.getElementById('multiDl').submit();
    } else if (targetUrl.includes('download')) {
        removeElementById('loading');
        document.getElementById('S3_Filepick_Select').value = s3Array[0].Key;
        document.getElementById('singleDl').submit();
    } else {
        fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
        },
        body: JSON.stringify({ array: s3Array })
        })
        .then(response => { 
            if (response.ok){
                renewList();
                response.text().then(text => {
                window.confirm(text);
                });
                removeElementById('loading');
            } else {
                console.log('Error while performing operation');
                removeElementById('loading');
            }
        })
        .catch(e => { 
            window.alert(e) 
        });
    }
}

//Read all keys to send back to server to handle deletion of both directories and single files.
function s3Ops(targetPath) {
    const ops = targetPath.slice(1);
    if (s3Targets == 0) {
        document.getElementById('S3_UI_NavBar').insertAdjacentHTML('beforeend', '<p id=\"S3_UI_Msg\">Please select an object.</p>')
        return
    }
    const collectedS3Keys = [];
    const collectKeys = (s3Objects) => {
        for (s3Object in s3Objects) {
            if (s3Objects[s3Object].hasOwnProperty('Key') && (typeof s3Objects[s3Object].Key) === 'string') {
                collectedS3Keys.push({ Key: s3Objects[s3Object].Key });
            }
            if (s3Objects[s3Object].hasOwnProperty('Size') && s3Objects[s3Object].Size === 0) {
                collectKeys(s3Objects[s3Object]);
            }
        }
    }
    if (!Array.isArray(s3Targets) && (typeof s3Targets) === 'object') {
        if (window.confirm(`Are you sure you want to ${ops} the entire contents of directory ${s3Targets.Key}`)) {
            insertLoading('S3_Function_Buttons');
            collectedS3Keys.push({ Key: s3Targets.Key });
            collectKeys(s3Targets);
            sendS3Keys(targetPath, collectedS3Keys);
        } else {
            return
        }
    } else if (Array.isArray(s3Targets)) {
        let targetString = '\n';
        s3Targets.forEach((key, i) => {
            if (i <= 9) {
                targetString = targetString.concat(`${key}\n`);
            } else if (i === 10) {
                targetString = targetString.concat('...');
            }
            collectedS3Keys.push({ Key: key });
        });
        if (window.confirm(`Do you want to ${ops} ${targetString}`)) {
            insertLoading('S3_Function_Buttons');
            sendS3Keys(targetPath, collectedS3Keys);
        } else {
            return
        }
    } else if (s3Targets === '/') {
        if (window.confirm(`ATTENTION. You are about to ${ops} the entire storage! Are you sure?`)) {
            insertLoading('S3_Function_Buttons');
            collectKeys(s3KeysGlobalVar);
            sendS3Keys(targetPath, collectedS3Keys);
        } else {
            return
        }
    }
}

function addDir() {
    var dirname = document.getElementById('S3_Create_Dir_Input').value;
    if (dirname === '') {
        removeElementById('S3_UI_Msg');
        document.getElementById('S3_UI_NavBar').insertAdjacentHTML('beforeend', '<p id=\"S3_UI_Msg\">Please select a directory.</p>');
        return
    } else if (dirname.startsWith('/')) {
        dirname = dirname.slice(1);
    }
    if (!sanitize(dirname)) {
        window.alert('Only alphanumeric character allowed as well as ! . _ * \' () - ');
        return
    }
    if (uploadInput === '/' || uploadInput === '') {
        var newdir = dirname;
    } else {
        var newdir = uploadInput.concat(dirname);
    }
    insertLoading('S3_Function_Buttons');
    fetch('/createdir', {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain'
        },
        body: newdir
    })
    .then(response => { 
        if (response.ok) {
            renewList();
            window.confirm('Succesfully created directory.');
            removeElementById('loading');
        } else {
            console.log('Error while creating directory.');
        }
    })
    .catch(e => { 
        window.alert(e) 
    });
}

//Uses lib-storage on the server-side. Unable to track proress v
async function uploadFile() {
    const targetDir = uploadInput;
    const file = document.getElementById('S3_Upload_Input').files[0];
    const filename = file.name;
    if (!file) {
        document.getElementById('S3_UI_NavBar').insertAdjacentHTML('beforeend', '<p id=\"S3_UI_Msg\">Please select a file.</p>');
        return
    }
    if (!sanitize(filename)) {
        window.alert('Only alphanumeric character allowed as well as ! . _ * \' () - ');
        return
    }
    insertLoading('S3_Function_Buttons');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('filedir', targetDir);
    //Set up progress tracker.
    //TODO: Implement @aws/xhr-http-handeler for smoother progress tracking.
    const progressBar = document.getElementById('S3_Upload_Progress_Bar');
    const eventSource = new EventSource(`/progress`);
    eventSource.onmessage = (event) => {
        const progress = JSON.parse(event.data);
        progressBar.value = (progress.loaded / progress.total) * 100;
    };
    eventSource.onerror = (e) => {
        window.alert('Unable to track progress: ', e);
        eventSource.close();
    };
    displayItemById('S3_Progress');

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData,
            credentials: 'include',
        });
        if (response.ok) {
            window.confirm(`Succesfully uploaded ${filename}`);
        };
    } catch (e) {
        window.alert(`Upload failed: ${e}`);
    }
    eventSource.close();
    removeElementById('loading');
    displayItemById('S3_Progress');
    return
}

//Fetch static file list of storage & try to renew list of all objects.
function loadExisting() {
    fetch('/filepicker1')
        .then(response => response.json())
        .then(s3Object => {
            s3KeysGlobalVar = s3Object.s3Dir;
            fuzzySearchList = s3Object.s3List;
            dirLvl = 0;
            s3Targets = [];
            s3InitializeUI(s3KeysGlobalVar, false);
        })
        .catch(e => console.error('Error fetching data:',e));
}

//Fetches updated list and triggers list-objects-v2 server-side.
function renewList() {
    fetch('/filepicker2')
        .then(response => response.json())
        .then(newS3Object => {
            s3KeysGlobalVar = newS3Object.s3Dir;
            fuzzySearchList = newS3Object.s3List;
            removeElementById('loading');
        })
        .catch(e => {
            console.error('Error updating S3 object list:',e);
        })
}

function copyText(targetString, endpoint, toClipboard) {
    const localDomain = window.location.origin.toString();
    if (!localDomain.endsWith('/')) {
        localDomain.concat('/');
    }
    const link = `${localDomain}${endpoint}${targetString}`;
    if (toClipboard === true) {
        navigator.clipboard.writeText(link);
        alert('Copied link to clipboard.');
    }
    return link;
}

//Set up event listener for cross-site-iframe.js
async function initializeIframe() {
    try {
        //Check if I am inside an iframe
        iframeResult = window.self !== window.top;
        if (!iframeResult === true) {
            insideIframe = false;
            return
        }
        insideIframe = true;
        //Fetch list of allowed cross-site-domains.
        window.addEventListener('message', function(event) {
            const message = event.data;
            if (message.action === 'attachOnChange' && message.elementId) {
                const selectElement = document.getElementById(message.elementId);
                if (!selectElement) {
                    return
                }
                selectElement.onchange = function() {
                    const inputString = document.getElementById(message.elementId).value;
                    const selectedLink = copyText(inputString, '/download?filename=', false);
                    // Send the selected value back to the parent page
                    event.source.postMessage({
                        action: 'valueChanged',
                        value: selectedLink,
                    }, event.origin);
                };
            }
        });
    } catch (e) {
        console.log('Error: ', e)
    }
};

function fuzzysearch() {
    const searchUI = document.getElementById('S3_Search_Results');
    const fileUI = document.getElementById('S3_Filepick_UI');
    if (searchUI.style.display !== 'flex') { 
        searchUI.style.display = 'flex';
        fileUI.style.display = 'none';
    }
    const searchTarget = document.getElementById('S3_Search_Input').value
    if (searchTarget === '') {
        searchUI.style.display = 'none';
        searchUI.innerHTML = '';
        fileUI.style.display= 'flex';
        return
    }
    let searchResult = fuzzysort.go(searchTarget, fuzzySearchList, {key: 'Key'}, {limit: 100, threshold: .9});
    const searchS3Objects = {};
    for (obj in searchResult) {
        searchS3Objects[obj] = searchResult[obj].obj;
    }
    s3InitializeUI(searchS3Objects, true);
}

loadExisting();
renewList();
uploadInput = '/';
initializeIframe();
