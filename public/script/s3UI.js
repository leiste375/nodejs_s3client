//Insert simple loading gif
function insertLoading(htmlId) {
    const htmlTarget = document.getElementById(htmlId);
    htmlTarget.insertAdjacentHTML('beforeend', '<div id=\"loading\" class=\"loading\" order=\"1\"></div>')
}
function removeElementById(elementId) {
    const loadingDiv = document.getElementById(elementId);
    if (loadingDiv) {
        loadingDiv.remove();
    }
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
};

//Construct root directory in UI
function s3InitializeUI(s3Keys) {
    console.log(s3Keys);
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

//Code to handle navigation and forward appropriate values to other function.
function s3UIHandleButton(s3Key) {
    const uploadInput = document.getElementById('S3_Upload_Dir_Input');
    const divUI = document.getElementById('S3_UI_NavBar');
    //Ensure that no active messages remain in navigation bar.
    removeElementById('S3_UI_Dir_Empty');
    //Check if target is a file or a directory and act accordingly.
    const traverseJson = (s3Objects, s3Key) => {
        for (s3Object in s3Objects) {
            if (s3Objects[s3Object].hasOwnProperty('Key') && s3Objects[s3Object].Key == s3Key) {
                if (Object.keys(s3Objects[s3Object]).length <= 2 && s3Objects[s3Object].Size == 0) {
                    divUI.insertAdjacentHTML('beforeend', '<p id=\"S3_UI_Dir_Empty\">Directory empty.</p>');
                    uploadInput.value = s3Key;
                    currentS3Target = s3Key;
                    return
                } else if (Object.keys(s3Objects[s3Object]).length <= 2 && s3Objects[s3Object].Size > 0){
                    document.getElementById('S3_Filepick_Select').value = s3Key;
                    currentS3Target = s3Key;
                    return
                } else {
                    uploadInput.value = s3Key;
                    currentS3Target = s3Objects[s3Object];
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
                    document.getElementById(`${currentLvl}_nav_btn`).addEventListener( 'click', function(){ s3NavButton(currentLvl, s3Key) } );
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
function s3NavButton(targetLvl, s3Key) {
    if (targetLvl == dirLvl) {
        return;
    }
    for (let i = dirLvl; i >= targetLvl && i != 0; i--) {
        let navBtnString = `${i}_nav_btn`;
        removeElementById(navBtnString);
    }
    if (targetLvl == 0) {
        dirLvl = targetLvl;
        document.getElementById('S3_Upload_Dir_Input').value = '/';
        currentS3Target = '/';
        s3InitializeUI(s3KeysGlobalVar);
    } else {
        dirLvl = targetLvl - 1;
        s3UIHandleButton(s3Key);
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
            window.confirm('Deletion succesful');
            removeElementById('loading');
            //console.log(response);
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
        console.log(currentS3Target.Key);
        if (window.confirm(`Are you sure you want to delete the entire contents of directory ${currentS3Target.Key}`)) {
            insertLoading('S3_Functions');
            deleteS3Keys.push({ Key: currentS3Target.Key });
            collectKeys(currentS3Target);
            sendS3Keys('/delete', deleteS3Keys);
        } else {
            return
        }
    } else if ((typeof currentS3Target) == 'string' && currentS3Target != '/') {
        if (window.confirm(`Are you want to the delete ${currentS3Target}`)) {
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

//Fetch static file list of storage & try to renew list of all objects.
fetch('/filepicker1')
    .then(response => response.json())
    .then(s3Keys => {
        s3KeysGlobalVar = s3Keys;
        dirLvl = 0;
        currentS3Target = '/';
        const filepickDropdown = document.getElementById('S3_Filepick_Select');
        fillS3Download(filepickDropdown, s3KeysGlobalVar);
        s3InitializeUI(s3KeysGlobalVar);
    })
    .catch(e => console.error('Error fetching data:',e));
//loadingGif('S3_UI_NavBar');
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
