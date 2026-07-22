import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import Blog from '../models/Blog';

// List Blogs
export const listBlogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const blogs = await Blog.find({}).sort({ createdAt: -1 });
    res.json(blogs);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching blogs', error: error.message });
  }
};

// Create Blog
export const createBlog = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, subtitle, content, banner, category, author } = req.body;
    if (!title || !content) {
       res.status(400).json({ message: 'Missing title or content' });
       return;
    }

    const blog = new Blog({
      title,
      subtitle: subtitle || '',
      content,
      banner: banner || '',
      category: category || 'Fintech',
      author: author || 'Admin',
      time: Math.floor(Date.now() / 1000),
    });

    await blog.save();
    res.status(201).json({ message: 'Blog post created successfully', blog });
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating blog post', error: error.message });
  }
};

// Update Blog
export const updateBlog = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, subtitle, content, banner, category, author } = req.body;
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
       res.status(404).json({ message: 'Blog post not found' });
       return;
    }

    if (title !== undefined) blog.title = title;
    if (subtitle !== undefined) blog.subtitle = subtitle;
    if (content !== undefined) blog.content = content;
    if (banner !== undefined) blog.banner = banner;
    if (category !== undefined) blog.category = category;
    if (author !== undefined) blog.author = author;

    await blog.save();
    res.json({ message: 'Blog post updated successfully', blog });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating blog post', error: error.message });
  }
};

// Get Blog By Id
export const getBlogById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
       res.status(404).json({ message: 'Blog post not found' });
       return;
    }
    res.json(blog);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching blog post', error: error.message });
  }
};

// Delete Blog
export const deleteBlog = async (req: AuthRequest, res: Response): Promise<void> => {

  try {
    await Blog.findByIdAndDelete(req.params.id);
    res.json({ message: 'Blog post deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting blog post', error: error.message });
  }
};
