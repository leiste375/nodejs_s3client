//Custom script to allow users to select download on third-party site.
//In this case hardcoded to interact with OpenSpecimen, but can be adapted easily enough.
s3MiddlewareUrl = 'https://localhost:3050';
console.log('I\'m alive'); 
function createModal() {
    cssCode = `.S3_Modal {
        position: fixed;
        z-index: 3;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        overflow: auto;
        background-color: rgba(0, 0, 0, 0.8);
    }
    .S3_Web_Client {
        margin: 60px auto auto auto;
        width: 90vw;
        height: 90vh;
        width: 90%;
    }
    .S3_Modal_Header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .S3_Fake_Input_Wrapper {
        display: flex;
        width: 50vw;
        margin-left: 3px;
    }
    .S3_Modal_Label {
        color: white;
        margin-bottom: 0;
        align-items: center;
        display: flex
    }
    .S3_Fake_Input {
        width: 50%;
        height: 25px;
        margin-left: 10px;
    }
    .S3_Iframe {
        width: 100%;
        height: 100%;
        box-shadow: 0 0 5px 3px rgba(0,0,0,0.5);
        border: none;
    }
    .S3_Modal_Control {
            background: none;
        border: none;
        color: white;
        font-size: 24px;
    }`;
    var newStyle = document.createElement('style');
    newStyle.textContent = cssCode;
    document.head.appendChild(newStyle);
    document.body.insertAdjacentHTML('beforeend',
    `<div id="S3_Modal" class="S3_Modal" style="display :none;">
        <div class="S3_Web_Client">
            <div id="S3_Modal_Header" class="S3_Modal_Header">
                    <div class="S3_Fake_Input_Wrapper">
                    <label class="control-label S3_Modal_Label">frX Storage Location</label>
                    <input id="S3_Fake_Input" class="form-control S3_Fake_Input" onchange="trackS3Input"></input>
                </div>
                    <button class="S3_Modal_Control" onclick="displayS3Modal()"><span>&times</span></button>
            </div>
            <iframe id="S3_Iframe" class="S3_Iframe" src=""></iframe>
        </div>
    </div>
    `);
    trackIsSet = 0;
};

//Set up event listener to track slected item.
function trackS3Input() {
    const s3Iframe = document.getElementById('S3_Iframe');
    s3Iframe.onload = function() {
        const message = {
            action: 'attachOnChange',
            elementId: 'S3_Filepick_Select'
        };
        s3Iframe.contentWindow.postMessage(message, s3MiddlewareUrl);
    };

    window.addEventListener('message', function(event) {
        if (event.origin !== s3MiddlewareUrl) {
            return;
        };
      	document.getElementById('S3_Fake_Input').value = event.data.value;
      	S3InputElement.value = event.data.value;
    });
};

function displayS3Modal() {
    const s3ModalWindow = document.getElementById('S3_Modal');
    const iframe = document.getElementById('S3_Iframe');
    if (s3ModalWindow && s3ModalWindow.style.display === 'inline-block') {
        s3ModalWindow.style.display = 'none';
        iframe.src = '';
    } else {
        s3ModalWindow.style.display = 'inline-block';
        iframe.src = s3MiddlewareUrl;
        trackS3Input();
    };
};

var currentURL = window.location.href;
if ( currentURL.includes("addedit-specimen") ) {
    createModal();

    var xpath = "//span[contains(text(),'frX Storage Location')]";
    var S3Input = document.evaluate( xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null ).singleNodeValue.parentNode.parentNode;
    var S3InputElement = S3Input.childNodes[1];

    var s3Modal = document.getElementById('S3_Modal');
    var openS3Button = document.createElement('button');
    openS3Button.id = 'S3_Open_Modal';
    openS3Button.className = 'btn btn-primary';
    openS3Button.onclick = displayS3Modal;
    openS3Button.innerHTML += 'Select file';
    S3Input.appendChild(openS3Button);
};
