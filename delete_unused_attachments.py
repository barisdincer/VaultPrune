import os

# Legacy prototype kept for historical reference.
# The Obsidian plugin implementation now lives in the TypeScript source tree.

def delete_unused_attachments(z_ekler_path, main_folder_path):
    # Get list of files in z_ekler folder
    z_ekler_files = os.listdir(z_ekler_path)
    
    # Traverse through each file in z_ekler folder
    for file_name in z_ekler_files:
        file_used = False
        
        # Traverse through all markdown files in main folder and subfolders
        for root, _, files in os.walk(main_folder_path):
            for file in files:
                if file.endswith('.md'):
                    file_path = os.path.join(root, file)
                    with open(file_path, 'r', encoding='utf-8') as f:
                        # Check if file_name is present in the markdown file content
                        if file_name in f.read():
                            file_used = True
                            break
            if file_used:
                break
        
        # If file is not used, delete it
        if not file_used:
            file_path = os.path.join(z_ekler_path, file_name)
            os.remove(file_path)
            print("Deleted unused attachment:", file_name)

# Define the paths to z_ekler folder and main folder
attachment_path = r'C:\Users\baris\Obsidian\Kisisel\attachment_path'
main_folder_path = r'C:\Users\baris\Obsidian\Kisisel'

# Call the function to delete unused attachments
delete_unused_attachments(attachment_path, main_folder_path)
