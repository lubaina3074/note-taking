
let menuVisible = false;
const customMenu = document.getElementById('right-menu-upload-options');

document.addEventListener('DOMContentLoaded', () => {

document.querySelectorAll('.files-in-folder, .file-li').forEach(fileItem => {
    fileItem.addEventListener('contextmenu', function (event) {
        event.preventDefault();

        customMenu.setAttribute('data-target-unique-id', fileItem.dataset.uniqueId);
        customMenu.setAttribute('data-target-file-id', fileItem.dataset.fileId);

        customMenu.style.top = event.pageY + 5+ 'px';
        customMenu.style.left = event.pageX + 'px';
        customMenu.style.display = 'block';
        menuVisible = true;
    });
});

document.addEventListener('mousedown', function (event) {
    if (menuVisible && event.button === 0 && !customMenu.contains(event.target)) {
        customMenu.style.display = "none";
        customMenu.removeAttribute('data-target-unique-id');
        menuVisible = false;
    };
});

document.getElementById('rename-file').addEventListener('click', async function () {
    const currentUniqueId = customMenu.getAttribute('data-target-unique-id');
    if (!currentUniqueId) return;
    const filename = prompt('Enter the new name of the file');
    if (!filename) return;
    customMenu.style.display = "none";
    const response = await fetch('/notes/rename-file', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uniqueId: currentUniqueId, filename: filename }),
    })
    const data = await response.json();
    if (data.success) {

        alert("File renamed successfully!");

        //update UI
        const fileElement = document.querySelector(`[data-unique-id="${currentUniqueId}"]`)
        if (fileElement) {
            const filenameSpan = document.querySelector('.file-name');
            if (filenameSpan) filenameSpan.textContent = filename;
        }

    } else {
        alert("Failed to rename file");
    }
});


document.getElementById('delete-file').addEventListener('click', async function () {
    const currentUniqueId = customMenu.getAttribute('data-target-unique-id');
    if (!currentUniqueId) return;
    const sure = confirm("Are you sure you want to delete the file?");
    if (!sure) return;
    customMenu.style.display = "none";
    const response = await fetch(`/notes/delete/${currentUniqueId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
    })

    const data = await response.json();
    if (data.success) {
        alert('File deleted!');
        const fileElement = document.querySelector(`[data-unique-id="${currentUniqueId}"]`);
        fileElement.closest('li').remove();
    } else {
        alert('Failed to delete file');
    };
});

document.getElementById('download-file').addEventListener('click', function() {
    const currentUniqueId = customMenu.getAttribute('data-target-unique-id');
    if (!currentUniqueId) return;
    customMenu.style.display = "none";
    window.location.href = `/notes/download/${currentUniqueId}`;
});

});