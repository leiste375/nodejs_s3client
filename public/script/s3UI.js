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
    const s3FilepickerUI = document.getElementById('S3_Filepick_UI');
    s3FilepickerUI.innerHTML = '';
    var s3ListRunningId = 0;
    for (s3Entry in s3Keys) {
        //Ensure we have a valid S3 Object, and Key is not itself a directory within. 
        if (s3Keys[s3Entry].hasOwnProperty('Key') && (typeof s3Keys[s3Entry].Key) == 'string') {
            let dirName;
            let currentS3Key = s3Keys[s3Entry].Key;
            //Pretty names
            dirName = currentS3Key.split('/')[dirLvl];
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
            button.innerHTML = `<div class="S3_UI_Button_Inner"><img src=\"${IconSrc}\" width=\"32\" height=\"32\"><br>${dirName}</div>`;
            s3FilepickerUI.appendChild(button);
            document.getElementById(`S3_Filepick_Btn_${s3ListRunningId}`).addEventListener( 'click', function(){ s3UIHandleButton(currentS3Key) } );
            s3ListRunningId += 1;
        }
    };
};
function s3UIHandleButton(s3Key) {
    const uploadInput = document.getElementById('S3_Upload_Dir_Input');
    const divUI = document.getElementById('S3_UI_Messages');
    divUI.innerHTML = ''
    const traverseJson = (s3Objects, s3Key) => {
        for (s3Object in s3Objects) {
            if (s3Objects[s3Object].hasOwnProperty('Key') && s3Objects[s3Object].Key == s3Key) {
                if (Object.keys(s3Objects[s3Object]).length <= 2 && s3Objects[s3Object].Size == 0) {
                    divUI.innerHTML += "<p>Directory empty.</p>";
                    uploadInput.value = s3Key;
                    return
                } else if (Object.keys(s3Objects[s3Object]).length <= 2 && s3Objects[s3Object].Size > 0){
                    document.getElementById('S3_Filepick_Select').value = s3Key;
                    return
                } else {
                    uploadInput.value = s3Key;
                    dirLvl += 1;
                    const currentLvl = dirLvl;
                    let navButton = document.createElement('button');
                    navButton.id = `${currentLvl}_nav_btn`;
                    navButton.innerHTML = `<img src=\"graphics/OpenDirIconCC.svg\" width=\"24\" height=\"24\">${s3Key.split('/')[currentLvl - 1]}`;
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
function s3NavButton(targetLvl, s3Key) {
    if (targetLvl == dirLvl) {
        return;
    }
    for (let i = dirLvl; i >= targetLvl && i != 0; i--) {
        let navBtnString = `${i}_nav_btn`;
        document.getElementById(navBtnString).remove();
    }
    if (targetLvl == 0) {
        dirLvl = targetLvl;
        document.getElementById('S3_Upload_Dir_Input').value = '/';
        s3InitializeUI(s3KeysGlobalVar);
    } else {
        dirLvl = targetLvl - 1;
        s3UIHandleButton(s3Key);
    }
}
function s3HomeButton(targetLvl) {
    dirLvl = targetLvl;
    s3InitializeUI(s3KeysGlobalVar);
}
fetch('/filepicker1')
    .then(response => response.json())
    .then(s3Keys => {
        s3KeysGlobalVar = s3Keys;
        dirLvl = 0;
        const filepickDropdown = document.getElementById('S3_Filepick_Select');
        fillS3Download(filepickDropdown, s3KeysGlobalVar);
        s3InitializeUI(s3KeysGlobalVar);
    })
    .catch(e => console.error('Error fetching data:',e));
fetch('/filepicker2')
    .then(response => response.json())
    .then(currentS3Keys => {
        s3KeysGlobalVar = currentS3Keys;
        dirLvl = 0;
        const filepickDropdown = document.getElementById('S3_Filepick_Select');
        filepickDropdown.innerHTML = '';
        fillS3Download(filepickDropdown, s3KeysGlobalVar);
        s3InitializeUI(s3KeysGlobalVar);
    })
    .catch(e => {
        console.error('Error updating S3 object list:',e);
    })
