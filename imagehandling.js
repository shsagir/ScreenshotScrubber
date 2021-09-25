var ImageArrayJson = new Array();
var ImagesToReplace = new Array();
var ReplacementImages = new Array();
var PickedImageDetails = {};
var ImgTable = null;
var PageLoading = true;
var ThumbnailSize = 42;

document.body.addEventListener("load", ProcessImages());

function GetQueryVariable(variable) {
    var query = window.location.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=');
        if (decodeURIComponent(pair[0]) == variable) {
            return decodeURIComponent(pair[1]);
        }
    }
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function UpdateImageStore(objectToStore, key) {
    var jsonstr = JSON.stringify(objectToStore);
    var i = 0;
    var storageObj = {};

    // split jsonstr into chunks and store them in an object indexed by `key_i`
    while(jsonstr.length > 0) {
        var index = key + "_" + i++;

        // since the key uses up some per-item quota, see how much is left for the value
        // also trim off 2 for quotes added by storage-time `stringify`
        const maxLength = chrome.storage.local.QUOTA_BYTES_PER_ITEM - index.length - 200;
        var valueLength = jsonstr.length;
        if(valueLength > maxLength){
            valueLength = maxLength;
        }

        // trim down segment so it will be small enough even when run through `JSON.stringify` again at storage time
        //max try is QUOTA_BYTES_PER_ITEM to avoid infinite loop
        var segment = jsonstr.substr(0, valueLength); 
        for(let i = 0; i < chrome.storage.local.QUOTA_BYTES_PER_ITEM; i++){
            const jsonLength = JSON.stringify(segment).length;
            if(jsonLength > maxLength){
                segment = jsonstr.substr(0, --valueLength);
            }else {
                break;
            }
        }

        storageObj[index] = segment;
        chrome.storage.local.set({[index]: storageObj[index]});
        jsonstr = jsonstr.substr(valueLength);
    }
    
    chrome.storage.local.set({[key + "Length"]: i});
}

function ReadImageStorageSynchronous (key) {
    return new Promise((resolve) => {
        chrome.storage.local.get(key, function (result) {    
            if (result[key] === undefined) {
                resolve(undefined);
              } else {
                ImageArrayJson += result[key];
                resolve(result[key]);
              }
        });
    });
}

function GetImagesFromStorage(imageElement, keyBase, callback) {
    chrome.storage.local.get(keyBase + "Length", async function (StoreLen){
        for (var StoreItem = 0; StoreItem < StoreLen.ImagesToReplaceLength; StoreItem++)
        {
            var key = keyBase + "_" + StoreItem.toString();
            console.log(key);
            await ReadImageStorageSynchronous(key);
        }
        callback(imageElement);
    });
}

function htmlEscape(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function BoldAttr(tags, attributeToBold, clearFirst=false)
{
    tags = tags.replaceAll("<b style=\"background-color: #9bc3f0;\">", "___BSTART___").replaceAll("</b>", "___BEND___").replaceAll("\"", "&quot;").replaceAll("___BSTART___", "<b style=\"background-color: #9bc3f0;\">").replaceAll("___BEND___", "</b>");
    if (clearFirst)
        tags = tags.replaceAll("<b style=\"background-color: #9bc3f0;\">", "").replaceAll("</b>", "");
    var rx = null;
    if (attributeToBold == "src")
        rx = new RegExp("(src)\\s*=\\s*&quot;((?!<i>&lt;inline data - cannot be used for src matching&gt;</i>).*?)&quot;", "i");
    else
        rx = new RegExp("(" + attributeToBold.toLowerCase() + ")\\s*=\\s*&quot;(.*?)&quot;", "i");

    return tags.replace(rx, "<b style=\"background-color: #9bc3f0;\">$1</b>=&quot;<b style=\"background-color: #9bc3f0;\">$2</b>&quot;");
} 

function BoldTag(e)
{
    var rx = new RegExp("([A-Za-z]*)", "g");
    var r = "-1";
    if (typeof e == "string")
        r = e;
    else
        r = this.id.replace(rx, "");

    var s = document.getElementById("htmlTag" + r).innerHTML.replaceAll("<b style=\"background-color: #9bc3f0;\">", "").replaceAll("</b>", "");
    var id = document.getElementById("matchId" + r);
    var href = document.getElementById("matchHref" + r);
    var src = document.getElementById("matchSrc" + r);
    var cls = document.getElementById("matchClass" + r);
    if (id != null && id.checked) s = BoldAttr(s, "id");
    if (cls != null && cls.checked) s = BoldAttr(s, "class");
    if (src != null && src.checked) s = BoldAttr(s, "src");
    if (href != null && href.checked) s = BoldAttr(s, "href"); 
    document.getElementById("htmlTag" + r).innerHTML = s;
    
    if (id != null) ImagesToReplace.find(i=>i.imgId == r).matchID = id.checked;
    if (href != null) ImagesToReplace.find(i=>i.imgId == r).matchHref = href.checked;
    if (src != null) ImagesToReplace.find(i=>i.imgId == r).matchSrc = src.checked;
    if (cls != null) ImagesToReplace.find(i=>i.imgId == r).matchClass = cls.checked;
    UpdateImageStore(ImagesToReplace, "ImagesToReplace");
    if (!PageLoading) FlashSaved();
}

function ScaleChange(e)
{
    var rx = new RegExp("[A-Za-z]*", "g");
    var r = this.id.replace(rx, "");
    ImagesToReplace.find(i=>i.imgId == r).scaleToOld = this.checked;
    UpdateImageStore(ImagesToReplace, "ImagesToReplace");
    if (!PageLoading) FlashSaved();
}

function DelImg(e)
{
    var rx = new RegExp("[A-Za-z]*", "g");
    var r = parseInt(this.id.replace(rx, ""));
    ImgTable.deleteRow(ImagesToReplace.findIndex(i=>i.imgId == r) + 2);
    ImagesToReplace.splice(ImagesToReplace.findIndex(i=>i.imgId == r), 1);
    UpdateImageStore(ImagesToReplace, "ImagesToReplace");
    FlashSaved();
}
function CreateUniqueID(numDigits = 6) 
{
    var s = "";
    for (var i = 0; i < numDigits; i++)
        s += Math.round(Math.random() * 9.5 - .5).toString();
    return s;
}


function ImageSelected(e)
{
    var file = e.srcElement.files[0];
    var reader = new FileReader();
    reader.onloadend = function() {
      console.log('RESULT', reader.result)
    }
    console.log(reader.readAsDataURL(file));
    
}

function UpdateDefaultMatchSelections()
{
    PickedImageDetails.matchID = PickedImageDetails.imageElement.search(new RegExp("id\\s*=\\s*\"", "g")) != -1;
    if (!PickedImageDetails.matchID) PickedImageDetails.matchClass = PickedImageDetails.imageElement.search(new RegExp("class\\s*=\\s*\"", "g")) != -1;
    if (!PickedImageDetails.matchID && !PickedImageDetails.matchClass) PickedImageDetails.matchSrc = PickedImageDetails.imageElement.search(new RegExp("(src)\\s*=\\s*&quot;((?!<i>&lt;inline data - cannot be used for src matching&gt;</i>).*?)&quot;", "g")) != -1;
    if (!PickedImageDetails.matchID && !PickedImageDetails.matchClass && !PickedImageDetails.matchSrc) PickedImageDetails.matchHref = PickedImageDetails.imageElement.search(new RegExp("href\\s*=\\s*\"", "g")) != -1;
}

function ProcessImages()
{
    var PickedElementToReplace = GetQueryVariable("imageElement");
    if (PickedElementToReplace != undefined)
    {
        var t = Math.round(GetQueryVariable("top"), 0);
        var l = Math.round(GetQueryVariable("left"), 0);
        var w = Math.round(GetQueryVariable("width"), 0);
        var h = Math.round(GetQueryVariable("height"), 0);
        var r = GetQueryVariable("pixelRatio");
        var iw = GetQueryVariable("imgWidth");
        var imgSrc = GetQueryVariable("screenImg");
        var useSrc = false;
        var replacementURL = "";
        var matchID = false;
        var matchClass = false;
        var matchHref = false;
        var matchSrc = false;
        var scaleToOld = true;
        var imgId = CreateUniqueID();
        PickedImageDetails = {imgId, imageElement: PickedElementToReplace, useSrc, replacementURL, t, l, w, h, r, iw, imgSrc, matchID, matchClass, matchSrc, scaleToOld};
    }

    GetImagesFromStorage(PickedElementToReplace, "ImagesToReplace", function(imageElement) { 
        if (ImageArrayJson!= "")
        {
            ImagesToReplace = JSON.parse(ImageArrayJson);
            for (var i = 0; i < ImagesToReplace.length; i++)
            {
                if (ImagesToReplace[i]["imageElement"] == imageElement)
                    break;
            }
            if (i == ImagesToReplace.length && imageElement != undefined)
            {
                UpdateDefaultMatchSelections();
                ImagesToReplace.splice(ImagesToReplace.length, 0, PickedImageDetails);
            }
        }
        else
        {
            if (imageElement == undefined)
            {
                // // only happens the first time the tool options are accessed if no image was picked and none exist already, providing a default
                // PickedImageDetails = {
                //     "imageElement": "<img class=\"fxs-avatarmenu-tenant-image\">",
                //     "useSrc": false,
                //     "replacementURL": "https://portal.azure.com/Content/static/MsPortalImpl/AvatarMenu/AvatarMenu_defaultAvatarSmall.png"
                // };
            }
            else
            {
                UpdateDefaultMatchSelections();
                ImagesToReplace = new Array(PickedImageDetails);
                console.log(ImagesToReplace);
            }
        }
        UpdateImageStore(ImagesToReplace, "ImagesToReplace");
        
        // ugly, but there is a weird behavior where the first time one of the images is loaded, it does not appear.  
        // refreshing the page consistently after a new images has been added allows rendering then...
        if (GetQueryVariable("imagesRendered") == undefined)
        {
            window.location = chrome.runtime.getURL('options.html?imagesRendered=true');
        }
        else
        {
            //removes display:none and sets bgcolor. this hides the refresh flash...
            document.body.style = "background-color:cornflowerblue;"; 
        }

        ImgTable = document.getElementById("ImageList");

        for (var i = 0; i < ImagesToReplace.length; i++)
        {
            var imgId = ImagesToReplace[i].imgId;
            ImgTable.insertRow(ImgTable.rows.length - 1);
            const RemoveInlineSrcData = /src=.*\"/g;
            var scrubbedElement = ImagesToReplace[i].imageElement.replace(RemoveInlineSrcData, "src=\"<inline data - cannot be used for src matching>\"");
            const RemoveInlineSrcSetData = /srcset=.*\"/g;
            scrubbedElement = htmlEscape(scrubbedElement.replace(RemoveInlineSrcSetData, "")).replace("&lt;inline data - cannot be used for src matching&gt;", "<i>&lt;inline data - cannot be used for src matching&gt;</i>");
            ImgTable.rows[ImgTable.rows.length - 2].innerHTML = 
             "<td><div id=\"imageCropDiv_" + imgId + "\"><img id=\"imageCanvas_" + imgId + "\"></img></div></td>" + 
             "<td style=\"font-size: x-small;\" id=\"htmlTag" + imgId + "\">" +  scrubbedElement + "</td>" +
             "<td style=\"border-left: 1px dashed gray\">" +
                (scrubbedElement.search(new RegExp("id\\s*=\\s*&quot;", "g")) == -1 ? "" : "<center><input type=\"checkbox\" id=\"matchId" + imgId + "\" name=\"matchId" + imgId + "\"></center>") + "</td>" +
             "<td style=\"border-left: 1px dashed gray\">" + 
                (scrubbedElement.search(new RegExp("class\\s*=\\s*&quot;", "g")) == -1 ? "" : "<center><input type=\"checkbox\" id=\"matchClass" + imgId + "\" name=\"matchClass" + imgId + "\"></center>") + "</td>" +
             "<td style=\"border-left: 1px dashed gray\">" + 
                (scrubbedElement.search(new RegExp("(src)\\s*=\\s*&quot;((?!<i>&lt;inline data - cannot be used for src matching&gt;</i>).*?)&quot;", "g")) == -1 ? "" : "<center><input type=\"checkbox\" id=\"matchSrc" + imgId + "\" name=\"matchSrc" + i + "\"></center>") + "</td>" +
             "<td style=\"border-left: 1px dashed gray\"><center>" +
                (scrubbedElement.search(new RegExp("href\\s*=\\s*&quot;", "g")) == -1 ? "" : "<input type=\"checkbox\" id=\"matchHref" + imgId + "\" name=\"matchHref" + imgId + "\"></center>") + "</td>" +
             "<td style=\"border-left: 1px dashed gray;\"><center><input type=\"checkbox\" id=\"scaleToOld" + imgId + "\" name=\"scaleToOld" + imgId + "\"></center></td>" +
             "<td style=\"border-left: 1px dashed gray\"><center>" +
//                "<label style=\"cursor:pointer;color:blue;text-decoration:underline;\">Browse<input type=\"file\" style=\"position: fixed; top: -100em\" id=\"browse" + imgId + "\"></label>" +
                "<div class=\"dropdown\">\
                    <center><button class=\"dropbtn\" style=\"width: " + (ThumbnailSize + 12) + "px; height: " + (ThumbnailSize + 12) + "px;\";>\
                    <b>REMOVE IMAGE</b></button></center>\
                    <div class=\"dropdown-content\" style=\"background-color: #9bc3f0;\">\
                        <table style=\"padding: 1px;\" class=\"dropTable\">\
                            <tr>\
                                <td style=\"border-top: 0px;padding: 1px;\">\
                                    <button class=\"dropimg\" style=\"opacity: 100%;width: " + (ThumbnailSize + 12) + "px; height: " + (ThumbnailSize + 12) + "px;\">\
                                    <b>REMOVE IMAGE</b></button>\
                                </td>\
                                <td style=\"border-top: 0px;padding: 1px;\">\
                                    <button class=\"dropimg\" style=\"background: url(./images/avatarmenu_defaultavatarsmall.png);width: " + (ThumbnailSize + 12) + "px; height: " + (ThumbnailSize + 12) + "px;background-repeat: no-repeat; background-position: center; background-size: contain;\">\
                                </td>\
                                <td style=\"border-top: 0px;padding: 1px;\">\
                                    <button class=\"dropimg\" style=\"color: white;width: " + (ThumbnailSize + 12) + "px; height: " + (ThumbnailSize + 12) + "px;\" id=\"btnBrowse" + imgId + "\">\
                                    <b style='font-size:large'><input style='display:none;' accept='image/*' type=\"file\" id=\"browseDialog" + imgId + "\"/>...</b>\
                                    </button>\
                                </td>\
                            </tr>\
                        </table>\
                    </div>\
                </div>" +
                "<center></td>" +
             "<td style=\"\"><img valign=bottom src=\"./images/minus.png\" id=\"deleteImg" + imgId + "\"></td>";
            var id = document.getElementById("matchId" + imgId);
            var href = document.getElementById("matchHref" + imgId);
            var src = document.getElementById("matchSrc" + imgId);
            var cls = document.getElementById("matchClass" + imgId);
            var scale = document.getElementById("scaleToOld" + imgId);
            var del = document.getElementById("deleteImg" + imgId);
            var browse = document.getElementById("btnBrowse" + imgId);
            var browseInput = document.getElementById("browseDialog" + imgId);
            if (id != null) id.addEventListener("change", BoldTag);
            if (href != null) href.addEventListener("change", BoldTag);
            if (src != null) src.addEventListener("change", BoldTag);
            if (cls != null) cls.addEventListener("change", BoldTag);
            browse.addEventListener("click", function () {browseInput.click();});
            browseInput.addEventListener("change", ImageSelected);
            scale.addEventListener("change", ScaleChange); 
            del.addEventListener("click", DelImg);
            if (id != null && ImagesToReplace[i].matchID) id.checked = true;
            if (src != null && ImagesToReplace[i].matchSrc) src.checked = true;
            if (href != null && ImagesToReplace[i].matchHref) href.checked = true;
            if (cls != null && ImagesToReplace[i].matchClass) cls.checked = true;
            BoldTag(imgId);
            var imageCropDiv = document.getElementById("imageCropDiv_" + imgId);
            var imageCanvas = document.getElementById("imageCanvas_" + imgId);
            var t = ImagesToReplace[i].t;
            var l = ImagesToReplace[i].l;
            var w = ImagesToReplace[i].w;
            var h = ImagesToReplace[i].h;
            var r = ImagesToReplace[i].r;
            var imgWidth = ImagesToReplace[i].iw;
            var imgSrc = ImagesToReplace[i].imgSrc;
            var useSrc = false;
            var replacementURL = "";
                       
            if (imgSrc != undefined) 
            {
                imageCanvas.src = imgSrc;
                imageCanvas.width = Math.round(imageCanvas.width / r * (ThumbnailSize / w));  
                imageCanvas.style = "margin: -" + Math.round(t * (ThumbnailSize/w)) + "px 0 0 -" + Math.round(l * (ThumbnailSize/w))+ "px;"; 
                imageCropDiv.style = "width: " + ThumbnailSize + "px;height: " + ThumbnailSize/w * h + "px;border: 2px solid gray;border-radius: 3px;overflow: hidden;";  
                
            }
        }
        PageLoading = false;
    });
}