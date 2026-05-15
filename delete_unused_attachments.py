import os

# Legacy prototype kept for historical reference.
# The Obsidian plugin implementation now lives in the TypeScript source tree.


def delete_unused_attachments(attachment_folder_path, vault_path):
    # Get list of files in the attachment folder
    attachment_files = os.listdir(attachment_folder_path)

    # Traverse through each file in the attachment folder
    for file_name in attachment_files:
        file_used = False

        # Traverse through all markdown files in the vault folder and subfolders
        for root, _, files in os.walk(vault_path):
            for file in files:
                if file.endswith(".md"):
                    file_path = os.path.join(root, file)
                    with open(file_path, "r", encoding="utf-8") as f:
                        # Check if file_name is present in the markdown file content
                        if file_name in f.read():
                            file_used = True
                            break
            if file_used:
                break

        # If file is not used, delete it
        if not file_used:
            file_path = os.path.join(attachment_folder_path, file_name)
            os.remove(file_path)
            print("Deleted unused attachment:", file_name)


# Define the paths to the attachment folder and vault folder
attachment_path = r"C:\Path\To\Your\Vault\Attachments"
vault_path = r"C:\Path\To\Your\Vault"

# Call the function to delete unused attachments
delete_unused_attachments(attachment_path, vault_path)
