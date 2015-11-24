export function format2(int) {
    return int < 10 ? '0' + int : '' + int;
}

// stolen from piskel
export function downloadAsFile(content, filename) {
    var saveAs = window.saveAs || (navigator.msSaveBlob && navigator.msSaveBlob.bind(navigator));
    if (saveAs) {
        saveAs(content, filename);
    } else {
        var downloadLink = document.createElement('a');
        var href = window.URL.createObjectURL(content);
        downloadLink.setAttribute('href', href);
        downloadLink.setAttribute('download', filename);
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    }
}
