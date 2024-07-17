//Insert simple loading gif
function insertLoading(htmlId) {
    document.getElementById(htmlId).insertAdjacentHTML('beforeend', '<div id=\"loading\" class=\"loading\" order=\"1\"></div>')
}
function removeElementById(elementId) {
    const loadingDiv = document.getElementById(elementId);
    if (loadingDiv) {
        loadingDiv.remove();
    }
}

//If click on non-interactive element, clear everything. Tied to "background" class. 
function clearTarget() {
    currentS3Target = null;
    document.getElementById('S3_Filepick_Select').value = '';
    document.getElementById('S3_Upload_Dir_Input').value = '';
}
//Fill filepicker dropdown menu containing all files in S3 storage.
function fillS3Download(s3HTMLElement, s3Keys) {
    const traverseJson = (s3objects) => {
        for (s3object in s3objects) {
            //Check if object is a file & add option to dropdown menu.
            if ( s3objects[s3object].hasOwnProperty('Key') && (typeof s3objects[s3object].Key) == 'string' && s3objects[s3object].Size != 0 ) {
                const option = document.createElement('option');
                option.value = s3objects[s3object].Key;
                option.text = s3objects[s3object].Key;
                s3HTMLElement.appendChild(option);
            //Restart loop if object contains other objects.
            } else if ( (typeof s3objects[s3object]) == 'object' && Object.keys(s3objects[s3object]).length > 2 ) {
                traverseJson(s3objects[s3object]);
            }
        }
    };
    traverseJson(s3Keys);
    //Insert empty value as a placeholder.
    const option = document.createElement('option');
    option.value = '';
    option.text = 'Please select file';
    s3HTMLElement.appendChild(option);
    s3HTMLElement.value = '';
};

//Construct directory in UI
function s3InitializeUI(s3Keys) {
    const s3FilepickerUI = document.getElementById('S3_Filepick_UI');
    s3FilepickerUI.innerHTML = '';
    var s3ListRunningId = 0;
    for (s3Entry in s3Keys) {
        //Ensure we have a valid S3 Object, and Key is not itself a directory within. 
        if (s3Keys[s3Entry].hasOwnProperty('Key') && (typeof s3Keys[s3Entry].Key) == 'string') {
            let dirName;
            let currentS3Key = s3Keys[s3Entry].Key;
            //Pretty names
            if (dirLvl == 0 && currentS3Key.startsWith('/')) {
                dirName = `/${currentS3Key.split('/')[1]}`;
            } else {
                dirName = currentS3Key.split('/')[dirLvl];
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
            button.id = `S3_Filepick_Btn_${s3ListRunningId}`;
            button.className = 'S3_Filepick_UI';
            button.innerHTML = `<div class="S3_UI_Button_Inner"><img src=\"${IconSrc}\"><br>${dirName}</div>`;
            s3FilepickerUI.appendChild(button);
            document.getElementById(`S3_Filepick_Btn_${s3ListRunningId}`).addEventListener( 'click', function(){ s3UIHandleButton(currentS3Key) } );
            s3ListRunningId += 1;
        }
    };
};

//Code to handle navigation and forward appropriate values to other functions.
function s3UIHandleButton(s3Key) {
    const uploadInput = document.getElementById('S3_Upload_Dir_Input');
    const filepickInput = document.getElementById('S3_Filepick_Select');
    //Ensure that no active messages remain in navigation bar.
    removeElementById('S3_UI_Msg');
    //Check if target is a file or a directory and act accordingly.
    const traverseJson = (s3Objects, s3Key) => {
        for (s3Object in s3Objects) {
            if (s3Objects[s3Object].hasOwnProperty('Key') && s3Objects[s3Object].Key == s3Key) {
                if (Object.keys(s3Objects[s3Object]).length <= 2 && s3Objects[s3Object].Size == 0) {
                    document.getElementById('S3_UI_NavBar').insertAdjacentHTML('beforeend', '<p id=\"S3_UI_Msg\">Directory empty.</p>');
                    uploadInput.value = s3Key;
                    filepickInput.value = '';
                    currentS3Target = s3Key;
                    return
                } else if (Object.keys(s3Objects[s3Object]).length <= 2 && s3Objects[s3Object].Size > 0){
                    filepickInput.value = s3Key;
                    currentS3Target = s3Key;
                    return
                } else {
                    uploadInput.value = s3Key;
                    filepickInput.value = '';
                    const buttonTarget = s3Objects[s3Object];
                    dirLvl += 1;
                    const currentLvl = dirLvl;
                    let navButton = document.createElement('button');
                    navButton.id = `${currentLvl}_nav_btn`;
                    if (dirLvl == 1 && s3Key.startsWith('/')) {
                        navButtonText = `/${s3Key.split('/')[currentLvl]}`
                    } else {
                        navButtonText = s3Key.split('/')[currentLvl - 1];
                    }
                    navButton.innerHTML = `<img src=\"graphics/OpenDirIconCC.svg\">${navButtonText}`;
                    document.getElementById('S3_UI_NavBar').appendChild(navButton);
                    document.getElementById(`${currentLvl}_nav_btn`).addEventListener( 'click', function(){ s3NavButton(currentLvl, buttonTarget) } );
                    s3InitializeUI(s3Objects[s3Object]);
                    return
                }
            } else if ( (typeof s3Objects[s3Object]) == 'object' && Object.keys(s3Objects[s3Object]).length > 2 ) {
                traverseJson(s3Objects[s3Object], s3Key);
            }
        };
    };
    traverseJson(s3KeysGlobalVar, s3Key);
};

//Code to handle click events in nav bar.
function s3NavButton(targetLvl, s3Object) {
    removeElementById('S3_UI_Msg');
    document.getElementById('S3_Filepick_Select').value = '';
    if (targetLvl == dirLvl) {
        //Check if we're home
        if (s3Object === '') {
            currentS3Target = '/';
        } else {
            document.getElementById('S3_Upload_Dir_Input').value = s3Object.Key;
            currentS3Target = s3Object;
        }
        return;
    }
    for (let i = dirLvl; i >= targetLvl && i != 0; i--) {
        let navBtnString = `${i}_nav_btn`;
        removeElementById(navBtnString);
    }
    if (targetLvl == 0) {
        dirLvl = targetLvl;
        document.getElementById('S3_Upload_Dir_Input').value = '';
        s3InitializeUI(s3KeysGlobalVar);
    } else {
        dirLvl = targetLvl - 1;
        s3UIHandleButton(s3Object.Key);
    }
}

//Send array of keys back to server for S3 API calls.
function sendS3Keys(targetUrl, s3Array) {
    fetch(targetUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
    },
    body: JSON.stringify({ array: s3Array })
    })
    .then(response => { 
        if (response.ok) {
            renewList();
            window.confirm('Deletion succesful');
            removeElementById('loading');
        } else {
            console.log('Error while deleting objects.');
        }
    })
    .catch(e => { 
        window.alert(e) 
    });
}

//Read all keys to send back to server to handle deletion of both directories and single files.
function deleteObj() {
    if (currentS3Target === null) {
        document.getElementById('S3_UI_NavBar').insertAdjacentHTML('beforeend', '<p id=\"S3_UI_Msg\">Please select an object for deletion.</p>')
        return
    }
    const deleteS3Keys = [];
    const collectKeys = (s3Objects) => {
        for (s3Object in s3Objects) {
            if (s3Objects[s3Object].hasOwnProperty('Key') && (typeof s3Objects[s3Object].Key) == 'string') {
                deleteS3Keys.push({ Key: s3Objects[s3Object].Key });
            }
            if (s3Objects[s3Object].hasOwnProperty('Size') && s3Objects[s3Object].Size == 0) {
                collectKeys(s3Objects[s3Object]);
            }
        }
    }
    if ((typeof currentS3Target) == 'object') {
        if (window.confirm(`Are you sure you want to delete the entire contents of directory ${currentS3Target.Key}`)) {
            insertLoading('S3_Functions');
            deleteS3Keys.push({ Key: currentS3Target.Key });
            collectKeys(currentS3Target);
            sendS3Keys('/delete', deleteS3Keys);
        } else {
            return
        }
    } else if ((typeof currentS3Target) == 'string' && currentS3Target != '/') {
        //Ensure that string is not a directory

        if (window.confirm(`Do you want to the delete ${currentS3Target}`)) {
            insertLoading('S3_Functions');
            deleteS3Keys.push({ Key: currentS3Target });
            sendS3Keys('/delete', deleteS3Keys);
        } else {
            return
        }
    } else if (currentS3Target == '/') {
        if (window.confirm(`ATTENTION. You are about to delete the entire storage! Are you sure?`)) {
            insertLoading('S3_Functions');
            collectKeys(s3KeysGlobalVar);
            sendS3Keys('/delete', deleteS3Keys);
        } else {
            return
        }
    }
}

function addDir() {
    const newdir = document.getElementById('S3_Upload_Dir_Input').value;
    if (newdir == '') {
        removeElementById('S3_UI_Msg');
        document.getElementById('S3_UI_NavBar').insertAdjacentHTML('beforeend', '<p id=\"S3_UI_Msg\">Please select a directory.</p>');
        return
    }
    console.log(newdir);
    insertLoading('S3_Functions');
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

//Fetch static file list of storage & try to renew list of all objects.
function loadExisting() {
    fetch('/filepicker1')
        .then(response => response.json())
        .then(s3Keys => {
            s3KeysGlobalVar = s3Keys;
            dirLvl = 0;
            currentS3Target = null;
            const filepickDropdown = document.getElementById('S3_Filepick_Select');
            fillS3Download(filepickDropdown, s3KeysGlobalVar);
            s3InitializeUI(s3KeysGlobalVar);
        })
        .catch(e => console.error('Error fetching data:',e));
}

function renewList() {
    fetch('/filepicker2')
        .then(response => response.json())
        .then(currentS3Keys => {
            s3KeysGlobalVar = currentS3Keys;
            const filepickDropdown = document.getElementById('S3_Filepick_Select');
            filepickDropdown.innerHTML = '';
            fillS3Download(filepickDropdown, s3KeysGlobalVar);
            removeElementById('loading');
        })
        .catch(e => {
            console.error('Error updating S3 object list:',e);
        })
}

loadExisting();
renewList();
